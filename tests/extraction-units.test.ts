import { describe, it, expect } from 'vitest';
import type { ESTreeNode } from '#src/types.js';
import type {
  ExtractionSuggestion,
  ExtractionOptions,
  VariableFlowAnalysis,
} from '#src/extraction/types.js';
import { analyzeExtractionOpportunities } from '#src/extraction/index.js';
import { findExtractionCandidates } from '#src/extraction/boundary-detector.js';
import { findUnits } from '#src/extraction/unit-finder.js';
import { isNestedFunction, walkChildren } from '#src/extraction/ast-utils.js';
import { createExtractionSuggestion, markNested } from '#src/extraction/suggestion-generator.js';
import { analyzeControlFlow } from '#src/extraction/control-flow.js';
import { parseAndPrepareAst } from './utils/test-helpers.js';
import { calculateCognitiveWithTracking, lintWithExtraction } from './utils/extraction-helpers.js';

/** Suggestions for one named function, via the same pipeline the rule uses. */
function suggest(code: string, name: string, options?: ExtractionOptions): ExtractionSuggestion[] {
  const result = calculateCognitiveWithTracking(code, 'test.ts').get(name)!;
  return analyzeExtractionOpportunities(
    result.node,
    result.points,
    result.total,
    result.variables,
    options
  );
}

/** The rendered `Smart extraction suggestions:` block of the first report; asserts it exists. */
function suggestionText(code: string, options?: Record<string, unknown>): string {
  const [message] = lintWithExtraction(code, options);
  expect(message).toContain('Smart extraction suggestions:');
  return message.slice(message.indexOf('Smart extraction suggestions:'));
}

function at(suggestions: ExtractionSuggestion[], start: number, end?: number) {
  const found = suggestions.find((s) => s.range.start === start && (!end || s.range.end === end));
  expect(found, `suggestion at lines ${start}-${end}`).toBeDefined();
  return found!;
}

function ranges(suggestions: ExtractionSuggestion[]): string[] {
  return suggestions.map((s) => `${s.range.start}-${s.range.end}`);
}

/** `unit` runs first in a function whose second half is a clean 4-point loop. */
function withFiller(unit: string): string {
  return `function target(a, b, items) {
${unit}
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
}`;
}

function unitFlow(code: string, startLine: number, endLine: number) {
  const result = calculateCognitiveWithTracking(code, 'test.ts').get('target')!;
  const unit = findUnits(result.node).find(
    (u) => u.start.line === startLine && u.end.line === endLine
  );
  expect(unit, `unit at lines ${startLine}-${endLine}`).toBeDefined();
  const candidate = {
    startLine,
    endLine,
    complexity: 1,
    complexityPercentage: 50,
    points: [],
    constructs: [],
    unit,
  };
  return { unit: unit!, flow: analyzeControlFlow(candidate, result.node) };
}

function unitRanges(code: string): string[] {
  const result = calculateCognitiveWithTracking(code, 'test.ts').get('target')!;
  return findUnits(result.node).map((u) => `${u.kind}:${u.start.line}-${u.end.line}`);
}

const REPRO_IF_HEADER = `type Variant = "a" | "b";

export const selectVariant = (
  showA: boolean,
  hasA: boolean,
  showB: boolean,
  hasB: boolean,
): Variant | undefined => {
  if (showA && hasA) {
    return "a";
  }

  if (showB && hasB) {
    return "b";
  }
  return undefined;
};`;

const REPRO_TOGGLE = `declare const save: (ids: string[]) => void;
declare const log: (msg: string) => void;

export const toggle = (ids: string[], id: string, isPinned: boolean, isLocked: boolean) => {
  if (isLocked) {
    log("locked");
    return;
  }

  const isAlreadySelected =
    ids.includes(id) && !isPinned;
  const next = isAlreadySelected ? ids.filter((x) => x !== id) : [...ids, id];

  save(next);
};`;

describe('Extraction candidates are AST units (#175)', () => {
  describe('issue repros through the lint rule', () => {
    it('repro 1: range covers the whole if, including the return in its body', () => {
      const text = suggestionText(REPRO_IF_HEADER);

      expect(text).toContain('Lines 9-11: Extractable with some refactoring');
      expect(text).toContain('Lines 13-15: Extractable with some refactoring');
      expect(text).not.toContain('Lines 9-9');
      expect(text).toContain('Inputs: showA: boolean, hasA: boolean');
      expect(text).toContain('Inputs: showB: boolean, hasB: boolean');
      expect(text).not.toContain('Suggested:');
      expect(text).toContain('Issue: Contains early return exiting the enclosing function');
      expect(text).toContain('(line 10)');
      expect(text).toContain('(line 14)');
    });

    it('repro 1: the remedy keeps the returned value', () => {
      const text = suggestionText(REPRO_IF_HEADER);

      expect(text).toContain('const r = extracted(');
      expect(text).toContain('if (r.exit) return r.value;');
      expect(text).not.toContain('if (extracted(...)) return;');
    });

    it('the remedy does not rely on the returned value being defined', () => {
      const text = suggestionText(`function onDone(err, user, next, log) {
  if (err) {
    if (user || next) { return next(err); }
    if (user && log) { return; }
  }
  log(user);
}`);

      expect(text).toContain('if (r.exit) return r.value;');
      expect(text).not.toContain('!== undefined');
    });

    describe('nested functions', () => {
      const body = `if (a && b) {
      if (c || a) { log(1); }
    }
    if (b || c) {
      if (a && c) { log(2); }
    }`;

      it('prints a signature for a top-level function', () => {
        const text = suggestionText(`function top(a, b, c) {
    ${body}
}`);

        expect(text).toContain('Suggested:');
        expect(text).not.toContain('Inside a nested function');
      });

      it('claims no signature for a nested function, whose inputs can be incomplete', () => {
        const text = suggestionText(`function outer(items) {
  return items.map((a, b, c) => {
    ${body}
    log(items);
  });
}`);

        expect(text).toContain('Inside a nested function');
        expect(text).toContain('Extractable with some refactoring');
        expect(text).not.toContain('Suggested:');
        expect(text).not.toContain('minimal changes');
      });

      it('treats a method of a module-level class as not nested', () => {
        const text = suggestionText(`class Foo {
  run(a, b, c) {
    ${body}
  }
}`);

        expect(text).toContain('Suggested:');
      });
    });

    it('repro 2: a declaration is never split and its variable is not an input', () => {
      const text = suggestionText(REPRO_TOGGLE);

      expect(text).not.toContain('Lines 11-12');
      expect(text).toContain('Lines 10-11: Extractable with minimal changes');
      expect(text).toContain('Inputs: ids: string[], id: string, isPinned: boolean');
      expect(text).toContain('Outputs: isAlreadySelected');
      expect(text).toContain(
        'Suggested: extracted(ids: string[], id: string, isPinned: boolean): unknown'
      );
      expect(text).toContain('Lines 12-12: Extractable with minimal changes');
      expect(text).toContain('Inputs: ids: string[], id: string, isAlreadySelected');
      expect(text).toContain('Outputs: next');
    });

    it('repro 3: a guard clause return is flagged instead of accepted as a trailing return', () => {
      const text = suggestionText(REPRO_TOGGLE);

      expect(text).toContain('Lines 5-8: Extractable with some refactoring');
      expect(text).toContain('Inputs: isLocked: boolean');
      expect(text).toContain('Issue: Contains early return exiting the enclosing function');
      expect(text).toContain('(line 7)');
      // A bare `return;` gets the bare-return remedy
      expect(text).toContain('if (extracted(...)) return;');
      expect(text).not.toContain('extracted(isLocked: boolean): void');
    });

    it('direct analysis reports ranges, confidence and issue lines', () => {
      const suggestions = suggest(REPRO_TOGGLE, 'toggle');

      expect(ranges(suggestions)).toEqual(['5-8', '10-11', '12-12']);
      const guard = at(suggestions, 5, 8);
      expect(guard.confidence).toBe('medium');
      expect(guard.suggestedSignature).toBeUndefined();
      expect(guard.issues).toEqual([expect.objectContaining({ type: 'early-return', line: 7 })]);
      expect(at(suggestions, 10, 11).confidence).toBe('high');
      expect(at(suggestions, 12, 12).suggestedSignature).toBeDefined();
    });
  });

  describe('safe-return shapes', () => {
    it('f1: a guard block dominated by a nested clean unit is not suggested', () => {
      const code = `declare const log: (x: unknown) => void;
export function f1(a: boolean, b: boolean, c: boolean, d: boolean, items: { x: boolean; y: boolean }[]) {
  if (a) {
    if (b && c) {
      log(1);
    }
    if (d) {
      log(2);
    }
    return;
  }
  for (const it of items) {
    if (it.x && it.y) {
      log(it);
    }
  }
}`;
      const suggestions = suggest(code, 'f1');

      expect(ranges(suggestions)).toEqual(['4-6', '12-16']);
      expect(suggestions.every((s) => s.confidence === 'high')).toBe(true);
      // Nothing covers the `return;` on line 10, in particular not the always-abrupt body
      expect(suggestions.some((s) => s.range.start <= 10 && s.range.end >= 10)).toBe(false);
    });

    it('e3: an always-abrupt block mid-function is medium, with no signature', () => {
      const code = `declare const log: (x: unknown) => void;
export function e3(k: boolean, a: boolean, b: boolean, items: number[]) {
  if (k) {
    if (a && b) {
      return 1;
    } else {
      return 2;
    }
  }
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
  return 0;
}`;
      // The whole `if (k)` is not abrupt (k may be false); its body is
      const [body] = suggest(code, 'e3', { maxComplexityPercentage: 50 });

      expect(body.range).toEqual({ start: 4, end: 8 });
      expect(body.confidence).toBe('medium');
      expect(body.suggestedSignature).toBeUndefined();
      const [issue] = body.issues;
      expect(issue.type).toBe('early-return');
      expect(issue.description).toContain('return extracted(');
      // Mid-function: there is code after the block, so "last statement" would be wrong
      expect(issue.description).not.toContain('last statement');

      const whole = at(suggest(code, 'e3'), 3, 9);
      expect(whole.issues[0].description).toContain('early return');
    });

    it('t3: a return at the tail is replaceable, medium, and never gets a void signature', () => {
      const code = `declare const log: (x: unknown) => void;
export function t3(items: number[], a: boolean, b: boolean, y: number) {
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
  if (a) {
    if (b) {
      return y;
    }
    log(a);
  }
}`;
      const tail = at(suggest(code, 't3'), 8, 13);

      expect(tail.confidence).toBe('medium');
      expect(tail.suggestedSignature).toBeUndefined();
      expect(tail.inputs.map((i) => i.name)).toContain('y');
      expect(tail.issues[0].description).toContain(
        'replace the whole block with `return extracted(...)`'
      );
      expect(tail.issues[0].line).toBe(10);
      expect(tail.issues[0].description).not.toContain('(line');
    });

    it('g1: a returned conditional expression is a replaceable unit', () => {
      const code = `export function g1(a: boolean, b: boolean, c: boolean, items: number[]) {
  for (const it of items) {
    if (it > 1 && it < 5) {
      console.log(it);
    }
  }
  return a && b ? 1 : c ? 2 : 3;
}`;
      const ret = at(suggest(code, 'g1'), 7, 7);

      expect(ret.confidence).toBe('medium');
      expect(ret.suggestedSignature).toBeUndefined();
      expect(ret.issues[0].description).toContain('`return extracted(...)`');
    });

    it('a bare tail return also offers the call-then-return form', () => {
      const code = `function target(a, b, items) {
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
  if (a && b) {
    log(a);
    return;
  }
}`;
      const tail = at(suggest(code, 'target'), 7, 10);

      expect(tail.confidence).toBe('medium');
      expect(tail.issues[0].description).toContain(
        '`return extracted(...)` or `extracted(...); return;`'
      );
    });
  });

  describe('nested callbacks', () => {
    it('h4: writes from a callback count as mutations, not by-value parameters', () => {
      const code = `declare const use: (x: number) => void;
export function h4(a: boolean, items: number[], other: number[]) {
  let count = 0;
  if (a && other.length) {
    items.forEach((x) => {
      count += x;
    });
  }
  for (const o of other) {
    if (o > 1 && o < 5) {
      use(o);
    }
  }
  use(count);
}`;
      const text = suggestionText(code);
      const suggestions = suggest(code, 'h4');
      const block = at(suggestions, 4, 8);

      expect(block.confidence).toBe('low');
      expect(block.issues.map((i) => i.description)).toContain("Mutates external variable 'count'");
      expect(block.suggestedSignature).toBeUndefined();
      expect(text).toContain("Mutates external variable 'count'");
    });

    it('inputs used only inside a callback are detected', () => {
      const code = `function w(flag, items, id) {
  const hit = flag
    ? items.filter((it) => it.id === id)
    : [];
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
  const later = () => hit.length;
  return later;
}`;
      const suggestions = suggest(code, 'w', { minComplexityPercentage: 10 });
      const hit = at(suggestions, 2, 4);

      expect(hit.inputs.map((i) => i.name)).toEqual(['flag', 'items', 'id']);
      // `hit` is only read inside a later callback, which still makes it an output
      expect(hit.outputs.map((o) => o.name)).toEqual(['hit']);
    });

    it('a return inside a nested callback is not an exit', () => {
      const code = withFiller(`  if (a && b) {
    items.forEach((x) => {
      if (x) return;
      log(x);
    });
  }`);
      const { flow } = unitFlow(code, 2, 7);

      expect(flow.earlyExits).toEqual([]);
      expect(flow.asyncBoundaries).toEqual([]);
    });
  });

  describe('control flow of a unit', () => {
    it('throw is not an early exit', () => {
      const code = `function target(a, b, items) {
  log(a);
  if (a && b) {
    throw new Error('bad');
  }
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
}`;
      const guard = at(suggest(code, 'target'), 3, 5);

      expect(guard.confidence).toBe('high');
      expect(guard.issues).toEqual([]);
      expect(guard.suggestedSignature).toBe('extracted(a, b): void');
    });

    it('if/else that returns or throws on every path is replaceable', () => {
      const code = `function target(a, b, items) {
  log(a);
  if (a && b) {
    log(1);
    return 1;
  } else {
    throw new Error('bad');
  }
  log(items);
}`;
      const { flow } = unitFlow(code, 3, 8);

      expect(flow.earlyExits).toEqual([
        { kind: 'return', line: 5, replaceable: true, hasArgument: true },
      ]);
    });

    it('a return after code that follows the unit is not replaceable', () => {
      const code = withFiller(`  if (a && b) {
    return a;
  }`);
      const { flow } = unitFlow(code, 2, 4);

      expect(flow.earlyExits).toEqual([
        { kind: 'return', line: 3, replaceable: false, hasArgument: true },
      ]);
    });

    it('a loop statement keeps its own continue, the loop body does not', () => {
      const code = `function target(items) {
  for (const it of items) {
    if (it.skip && it.hidden) {
      continue;
    }
    log(it);
  }
  log(items);
}`;
      expect(unitFlow(code, 2, 7).flow.earlyExits).toEqual([]);
      expect(unitFlow(code, 3, 6).flow.earlyExits).toEqual([
        { kind: 'continue', line: 4, replaceable: false },
      ]);
    });

    it('labeled break is internal only when its label is declared in the unit', () => {
      const code = `function target(rows) {
  outer: for (const row of rows) {
    for (const cell of row) {
      if (cell.done && cell.ok) {
        break outer;
      }
    }
  }
  log(rows);
}`;
      expect(unitFlow(code, 2, 8).flow.earlyExits).toEqual([]);
      expect(unitFlow(code, 3, 7).flow.earlyExits).toEqual([
        { kind: 'break', line: 5, replaceable: false, label: 'outer' },
      ]);
    });

    it('await and yield are async boundaries, not exits', () => {
      const asyncCode = `async function target(a, b, load) {
  if (a && b) {
    await load();
  }
  for await (const chunk of load()) {
    log(chunk);
  }
}`;
      expect(unitFlow(asyncCode, 2, 4).flow).toEqual({
        earlyExits: [],
        asyncBoundaries: [{ kind: 'await', line: 3 }],
      });
      expect(unitFlow(asyncCode, 5, 7).flow.asyncBoundaries).toEqual([{ kind: 'await', line: 5 }]);

      const generatorCode = `function* target(a, b) {
  if (a && b) {
    yield a;
  }
  log(b);
}`;
      expect(unitFlow(generatorCode, 2, 4).flow.asyncBoundaries).toEqual([
        { kind: 'yield', line: 3 },
      ]);
    });

    it('an await block is medium with an early-return typed issue and no signature', () => {
      const code = `async function target(a, b, items, load) {
  if (a && b) {
    await load(a);
  }
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
}`;
      const block = at(suggest(code, 'target'), 2, 4);

      expect(block.confidence).toBe('medium');
      expect(block.suggestedSignature).toBeUndefined();
      expect(block.issues).toEqual([
        {
          type: 'early-return',
          line: 3,
          description: 'Contains await; make the helper async and `await` it at the call site',
        },
      ]);
    });

    it.each([
      ['this', 'log(this.x);'],
      ['arguments', 'log(arguments.length);'],
      ['new.target', 'log(new.target);'],
    ])('%s makes the block medium with a this-reference issue', (_name, statement) => {
      const code = withFiller(`  if (a && b) {
    ${statement}
  }`);
      const block = at(suggest(code, 'target'), 2, 4);

      expect(block.confidence).toBe('medium');
      expect(block.suggestedSignature).toBeUndefined();
      expect(block.issues.map((i) => i.type)).toEqual(['this-reference']);
    });

    it('super makes the block medium', () => {
      const code = `class A extends B {
  target(a, b, items) {
    if (a && b) {
      super.run();
    }
    for (const it of items) {
      if (it > 1 && it < 5) {
        log(it);
      }
    }
  }
}`;
      const block = at(suggest(code, 'target'), 3, 5);

      expect(block.confidence).toBe('medium');
      expect(block.issues.map((i) => i.type)).toEqual(['this-reference']);
    });

    it('this inside a nested arrow is flagged, inside a nested function it is not', () => {
      const arrow = withFiller(`  if (a && b) {
    items.forEach((x) => {
      this.count += x;
    });
  }`);
      const fn = withFiller(`  if (a && b) {
    items.forEach(function (x) {
      return this.count + x;
    });
  }`);

      const arrowBlock = at(suggest(arrow, 'target'), 2, 6);
      expect(arrowBlock.confidence).toBe('medium');
      expect(arrowBlock.suggestedSignature).toBeUndefined();
      expect(arrowBlock.issues.map((i) => i.type)).toEqual(['this-reference']);

      const fnBlock = at(suggest(fn, 'target'), 2, 6);
      expect(fnBlock.confidence).toBe('high');
      expect(fnBlock.issues).toEqual([]);
    });
  });

  describe('unit enumeration', () => {
    it('treats an else-if chain as one statement and its consequents as bodies', () => {
      const code = `function target(a, b, c) {
  if (a) {
    log(1);
    log(2);
  } else if (b) {
    log(3);
    log(4);
  } else {
    log(5);
    log(6);
  }
  log(c);
}`;
      expect(unitRanges(code)).toEqual([
        'statement:2-11',
        'body:3-4',
        'statement:3-3',
        'statement:4-4',
        'body:6-7',
        'statement:6-6',
        'statement:7-7',
        'body:9-10',
        'statement:9-9',
        'statement:10-10',
        'statement:12-12',
      ]);
    });

    it('drops units that share a line with a neighbour', () => {
      const code = `function target(a, b) {
  log(a); if (b && a) {
    log(1);
  }
  if (a) { log(2); }
  if (b) {
    log(3);
  } log(b);
}`;
      // Not `log(a);` (shares a line with the `if`), not the `if (a) { log(2); }` body or the
      // `if (b) {...}` statement ending on the line where `log(b);` starts
      expect(unitRanges(code)).toEqual([
        'body:3-3',
        'statement:3-3',
        'statement:5-5',
        'body:7-7',
        'statement:7-7',
      ]);
    });

    it('strips a trailing break from a case, plain or in a block', () => {
      const code = `function target(k, a, b) {
  switch (k) {
    case 'a':
      if (a && b) {
        log(1);
      }
      log(2);
      break;
    case 'b': {
      log(3);
      log(4);
      break;
    }
    default:
      log(5);
      log(6);
  }
}`;
      expect(unitRanges(code)).toEqual([
        'statement:2-17',
        'case:4-7',
        'statement:4-6',
        'body:5-5',
        'statement:5-5',
        'statement:7-7',
        'statement:8-8',
        'case:10-11',
        'statement:10-10',
        'statement:11-11',
        'statement:12-12',
        'case:15-16',
        'statement:15-15',
        'statement:16-16',
      ]);
      expect(unitFlow(code, 4, 7).flow.earlyExits).toEqual([]);
      expect(unitFlow(code, 10, 11).flow.earlyExits).toEqual([]);
    });

    it('flags a break that escapes a case', () => {
      const code = `function target(k, a, b) {
  switch (k) {
    case 'a':
      if (a && b) {
        break;
      }
      log(2);
      log(3);
  }
}`;
      expect(unitFlow(code, 4, 8).flow.earlyExits).toEqual([
        { kind: 'break', line: 5, replaceable: false },
      ]);
    });

    it('h3: nothing on a `case x:` header line is a unit', () => {
      const code = `function target(k, a, b) {
  switch (k) {
    case 'a': log(1);
      log(2);
      break;
    case 'b': if (a && b) {
      log(3);
    }
  }
}`;
      const units = unitRanges(code);

      expect(units).not.toContain('case:3-4');
      expect(units).not.toContain('statement:3-3');
      expect(units).not.toContain('statement:6-8');
      expect(units).not.toContain('case:6-8');
      expect(units).toContain('statement:4-4');
      expect(units).toContain('body:7-7');
    });

    it('function bodies without a statement list have no units', () => {
      const arrow = calculateCognitiveWithTracking(
        'const target = (a, b) => a && b ? 1 : 2;',
        'test.ts'
      ).get('target')!;
      expect(findUnits(arrow.node)).toEqual([]);

      const messages = lintWithExtraction(`class C {
  field = a && b ? 1 : 2;
  static { if (a && b) { log(a); } }
}`);
      expect(messages.join('\n')).not.toContain('Smart extraction suggestions');
    });

    it('dedupes a statement and its identical body, keeping the statement', () => {
      const code = `function target(a, b, c, items) {
  if (a) {
    if (b && c) {
      log(1);
    }
  }
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
}`;
      const result = calculateCognitiveWithTracking(code, 'test.ts').get('target')!;
      const candidates = findExtractionCandidates(result.node, result.points, result.total);
      const inner = candidates.filter((c) => c.startLine === 3 && c.endLine === 5);

      expect(inner).toHaveLength(1);
      expect(inner[0].unit?.kind).toBe('statement');
    });

    it('drops units without complexity points', () => {
      const code = `function target(a, b, items) {
  log(a);
  log(b);
  for (const it of items) {
    if (it > 1 && it < 5) {
      log(it);
    }
  }
}`;
      const result = calculateCognitiveWithTracking(code, 'test.ts').get('target')!;
      const candidates = findExtractionCandidates(result.node, result.points, result.total, {
        maxComplexityPercentage: 100,
      });

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((c) => c.startLine >= 4)).toBe(true);
    });
  });

  describe('selection', () => {
    const code = `function target(a, b, c, d, items) {
  if (a && b) {
    log(1);
  }
  if (c && d) {
    log(2);
  }
  if (a && d) {
    log(3);
  }
  if (b && c) {
    log(4);
  }
  for (const it of items) {
    if (it > 1) {
      log(it);
    }
  }
}`;

    it('limits the number of suggestions', () => {
      expect(suggest(code, 'target', { minComplexityPercentage: 10 })).toHaveLength(3);
      expect(
        suggest(code, 'target', { minComplexityPercentage: 10, maxCandidates: 1 })
      ).toHaveLength(1);
    });

    it('prefers higher complexity first', () => {
      const [first] = suggest(code, 'target', { minComplexityPercentage: 10, maxCandidates: 1 });

      // The loop (+3) outweighs each +2 conditional
      expect(first.range).toEqual({ start: 14, end: 18 });
    });

    it('honours the complexity window', () => {
      expect(suggest(code, 'target', { minComplexityPercentage: 60 })).toEqual([]);
      expect(
        suggest(code, 'target', { minComplexityPercentage: 10, maxComplexityPercentage: 15 })
      ).toEqual([]);
    });

    it('ignores the deprecated maxLineGap option', () => {
      const baseline = ranges(suggest(code, 'target', { minComplexityPercentage: 10 }));

      expect(
        ranges(suggest(code, 'target', { minComplexityPercentage: 10, maxLineGap: 0 }))
      ).toEqual(baseline);
      expect(
        ranges(suggest(code, 'target', { minComplexityPercentage: 10, maxLineGap: 100 }))
      ).toEqual(baseline);
    });
  });

  describe('review follow-ups', () => {
    describe('static blocks count as nesting', () => {
      const inner = `if (a && b) {
          if (c || a) { use(secret); }
        }
        if (b || c) {
          if (a && c) { other(); }
        }`;
      const nestedCases: Record<string, string> = {
        'a function inside a static block': `class K {
  static {
    const secret = load();
    const run = (a, b, c) => {
        ${inner}
    };
  }
}`,
        'a method of a class inside a static block': `class K {
  static {
    const secret = load();
    class Inner {
      run(a, b, c) {
        ${inner}
      }
    }
  }
}`,
      };

      for (const [name, code] of Object.entries(nestedCases)) {
        it(`${name} is nested`, () => {
          const text = suggestionText(code);

          expect(text).toContain('Inside a nested function');
          expect(text).not.toContain('Suggested:');
        });
      }

      it('a top-level class method is not nested', () => {
        const text = suggestionText(`class K {
  run(a, b, c, secret) {
    ${inner}
  }
}`);

        expect(text).not.toContain('Inside a nested function');
        expect(text).toContain('Suggested:');
      });

      /** All functions and static blocks of the code, in source order. */
      function unitsOf(code: string): ESTreeNode[] {
        const { program } = parseAndPrepareAst(code, 'test.ts');
        const found: ESTreeNode[] = [];
        const visit = (n: ESTreeNode): void => {
          if (n.type === 'StaticBlock' || n.type === 'FunctionExpression') found.push(n);
          walkChildren(n, visit);
        };
        visit(program);
        return found;
      }

      it('a static block nested in a static block is nested', () => {
        const [outer, innerBlock] = unitsOf(`class K {
  static {
    class Inner {
      static {
        use(1);
      }
    }
  }
}`);

        expect(isNestedFunction(outer)).toBe(false);
        expect(isNestedFunction(innerBlock)).toBe(true);
      });

      it('a static block and method of a top-level class are not nested', () => {
        const units = unitsOf(`class K {
  static { use(1); }
  run() {}
}`);

        expect(units).toHaveLength(2);
        expect(units.map(isNestedFunction)).toEqual([false, false]);
      });
    });

    it('does not throw on an AST without loc', () => {
      const result = calculateCognitiveWithTracking(
        `function target(a, b, c) {
  if (a && b) {
    if (c || a) { log(1); }
  }
  if (b || c) {
    if (a && c) { log(2); }
  }
}`,
        'test.ts'
      ).get('target')!;
      const strip = (n: ESTreeNode): void => {
        delete (n as { loc?: unknown }).loc;
        walkChildren(n, strip);
      };
      strip(result.node);

      expect(
        analyzeExtractionOpportunities(result.node, result.points, result.total, result.variables)
      ).toEqual([]);
    });

    it('ranks nested and top-level functions identically', () => {
      const shape = (head: string) => `${head}
  if (a) {
    if (b && c) {
      if (a || b) { log(1); }
    }
    if (c) return 1;
  }
  if (b || c) {
    if (a && c) { log(2); }
  }
  return 2;
}`;
      const lines = (text: string, shift: number) =>
        [...text.matchAll(/Lines (\d+)-(\d+)/g)].map((m) => `${+m[1] - shift}-${+m[2] - shift}`);
      const top = suggestionText(shape('function top(a, b, c) {'));
      // The nested function starts one line lower
      const nested = suggestionText(`const o = () => {
  return ${shape('function nested(a, b, c) {')};
};`);

      expect(lines(top, 0)).toEqual(['3-5', '8-10']);
      expect(lines(nested, 1)).toEqual(lines(top, 0));
      expect(nested).not.toContain('Suggested:');
    });

    describe('nested warning', () => {
      const candidate = {
        startLine: 1,
        endLine: 2,
        complexity: 3,
        complexityPercentage: 50,
        points: [],
        constructs: [],
      };
      const flow = (extra: Partial<VariableFlowAnalysis>): VariableFlowAnalysis => ({
        inputs: [],
        outputs: [],
        mutations: [],
        closures: [],
        hasEarlyReturn: false,
        hasThisReference: false,
        ...extra,
      });
      const nestedIssues = (s: ExtractionSuggestion) =>
        s.issues.filter((i) => i.description.includes('Inside a nested function'));

      it('is added next to other issues, with no signature and no junk suggestion', () => {
        const result = markNested(
          createExtractionSuggestion(
            candidate,
            flow({ hasEarlyReturn: true, hasThisReference: true })
          )
        );

        expect(nestedIssues(result)).toHaveLength(1);
        expect(result.issues.length).toBeGreaterThan(1);
        expect(result.suggestedSignature).toBeUndefined();
        expect(result.suggestions.join('\n')).not.toContain('undefined');
      });

      it('keeps low confidence low and still warns', () => {
        const inputs = Array.from({ length: 6 }, (_, i) => ({ name: `v${i}` }));
        const result = markNested(
          createExtractionSuggestion(candidate, flow({ inputs: inputs as never }))
        );

        expect(result.confidence).toBe('low');
        expect(nestedIssues(result)).toHaveLength(1);
        expect(result.suggestedSignature).toBeUndefined();
      });

      it('lowers high confidence to medium', () => {
        const result = markNested(createExtractionSuggestion(candidate, flow({})));

        expect(result.confidence).toBe('medium');
        expect(nestedIssues(result)).toHaveLength(1);
      });
    });

    describe('await using', () => {
      it('is an await boundary like await', () => {
        const code = `async function target(a, b, c) {
  if (a && b) {
    await using r = open();
    if (c || a) { use(r); }
  }
  if (b || c) {
    if (a && c) { log(2); }
  }
}`;
        const { flow } = unitFlow(code, 3, 4);

        expect(flow.asyncBoundaries).toEqual([{ kind: 'await', line: 3 }]);
      });
    });

    describe('labels in the remedy', () => {
      const labelled = (jump: string) => `function target(rows, a) {
  outer: for (const row of rows) {
    for (const cell of row) {
      if (cell.done && a) {
        ${jump}
      }
      if (cell.ok || a) {
        log(cell);
      }
    }
  }
}`;

      it('names the label of a labelled jump', () => {
        const text = suggestionText(labelled('continue outer;'));

        expect(text).toContain('and `continue outer` at the call site');
      });

      it('keeps unlabelled wording unchanged', () => {
        const text = suggestionText(labelled('break;'));

        expect(text).toContain('and `break` at the call site');
      });

      it('stays accurate when a group mixes targets', () => {
        const text = suggestionText(`function target(rows, a) {
  outer: for (const row of rows) {
    for (const cell of row) {
      if (cell.done && a) {
        if (cell.ok || a) {
          continue outer;
        }
        if (cell.ok && a) {
          continue;
        }
      }
      log(cell);
    }
  }
}`);

        expect(text).toContain(
          'return which target to jump to from the helper and `continue` there at the call site'
        );
        expect(text).not.toContain('same target');
      });
    });
  });
});
