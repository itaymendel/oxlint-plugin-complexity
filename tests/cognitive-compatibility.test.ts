import { describe, expect, it } from 'vitest';
import { createCognitiveVisitor } from '#src/cognitive/visitor.js';
import { createCombinedComplexityVisitor } from '#src/combined-visitor.js';
import type { ComplexityPoint, ComplexityResult } from '#src/types.js';
import { getDisplayFunctionName } from '#src/utils.js';
import {
  createLineOffsetTable,
  createMockContext,
  offsetToLineCol,
  parseAndPrepareAst,
  walkWithVisitor,
} from './utils/test-helpers.js';

function calculate(code: string, mode: 'standalone' | 'combined'): Map<string, ComplexityResult> {
  const { program, errors } = parseAndPrepareAst(code, 'test.ts');
  expect(errors).toEqual([]);
  const results = new Map<string, ComplexityResult>();
  let index = 0;
  const context = createMockContext();
  const visitor =
    mode === 'standalone'
      ? createCognitiveVisitor(context, (result, node) => {
          results.set(getDisplayFunctionName(node, index++), result);
        })
      : createCombinedComplexityVisitor(context, (result, node) => {
          results.set(getDisplayFunctionName(node, index++), {
            total: result.cognitive,
            points: result.cognitivePoints,
          });
        });
  walkWithVisitor(program, visitor, code);
  return results;
}

// Expected ranges come from source snippets, independently of the visitor's AST nodes.
function point(code: string, source: string, message: string, complexity = 1): ComplexityPoint {
  const start = code.indexOf(source);
  expect(start).toBeGreaterThanOrEqual(0);
  const offsets = createLineOffsetTable(code);
  return {
    complexity,
    message,
    location: {
      start: offsetToLineCol(start, offsets),
      end: offsetToLineCol(start + source.length, offsets),
    },
  };
}

describe.each(['standalone', 'combined'] as const)('%s cognitive point compatibility', (mode) => {
  it('preserves loop labels, ranges, and traversal order', () => {
    const code = `function loops(items) {
  for (const key in items) {}
  for (const item of items) {}
  do {} while (items.length);
}`;
    const labels =
      mode === 'standalone'
        ? ['for...in', 'for...of', 'do...while']
        : ['for-in', 'for-of', 'do-while'];
    expect(calculate(code, mode).get('loops')).toEqual({
      total: 3,
      points: [
        point(code, 'for (const key in items) {}', `+1: ${labels[0]}`),
        point(code, 'for (const item of items) {}', `+1: ${labels[1]}`),
        point(code, 'do {} while (items.length);', `+1: ${labels[2]}`),
      ],
    });
  });

  it('counts repeated recursive calls once at the original location', () => {
    const code = `function recurse(n) {
  recurse(n - 1);
  recurse(n - 2);
}`;
    expect(calculate(code, mode).get('recurse')).toEqual({
      total: 1,
      points: [
        mode === 'standalone'
          ? point(code, code, '+1: recursion')
          : point(code, 'recurse(n - 1)', '+1: recursive call'),
      ],
    });
  });

  it('preserves recursion ordering relative to later decisions', () => {
    const code = `function recurse(n) {
  recurse(n - 1);
  if (n) return n;
}`;
    const decision = point(code, 'if (n) return n;', '+1: if');
    expect(calculate(code, mode).get('recurse')).toEqual({
      total: 2,
      points:
        mode === 'standalone'
          ? [decision, point(code, code, '+1: recursion')]
          : [point(code, 'recurse(n - 1)', '+1: recursive call'), decision],
    });
  });

  it('inherits nesting for declarations, expressions, and arrows without parent penalties', () => {
    const code = `function outer(flag) {
  function inner() { if (flag) return 1; }
  const arrow = () => { if (flag) return 2; };
  const expression = function () { if (flag) return 4; };
  if (flag) return 3;
}`;
    const results = calculate(code, mode);
    expect([...results.keys()]).toEqual(['inner', 'arrow', 'expression', 'outer']);
    expect(results.get('outer')).toEqual({
      total: 1,
      points: [point(code, 'if (flag) return 3;', '+1: if')],
    });
    expect(results.get('inner')).toEqual({
      total: 2,
      points: [point(code, 'if (flag) return 1;', '+2 (incl. 1 for nesting): if', 2)],
    });
    expect(results.get('arrow')).toEqual({
      total: 2,
      points: [point(code, 'if (flag) return 2;', '+2 (incl. 1 for nesting): if', 2)],
    });
    expect(results.get('expression')).toEqual({
      total: 2,
      points: [point(code, 'if (flag) return 4;', '+2 (incl. 1 for nesting): if', 2)],
    });
  });

  it('scores every callback in a branch-free Jest suite at zero (#165)', () => {
    const tests = Array.from(
      'abcdefghijklmnopqrstuvwxyz',
      (letter) => `it('${letter}', () => {});`
    );
    const code = `describe('isALetter', () => {\n${tests.join('\n')}\n});`;
    const results = calculate(code, mode);
    expect(results.size).toBe(27);
    for (const result of results.values()) {
      expect(result).toEqual({ total: 0, points: [] });
    }
  });

  it('reports outer = 1 and lambda = 7 for a callback inside an if (#165)', () => {
    const code = `export function outer(xs: number[], a: boolean) {
  if (a) {
    xs.forEach((x) => {
      if (x > 1) {
        if (x > 2) {
          console.log(x);
        }
      }
    });
  }
}`;
    const results = calculate(code, mode);
    expect([...results.keys()]).toEqual(['anonymous_1', 'outer']);
    expect(results.get('outer')).toEqual({
      total: 1,
      points: [point(code, code.slice(code.indexOf('if (a)'), code.lastIndexOf('\n}')), '+1: if')],
    });
    expect(results.get('anonymous_1')).toEqual({
      total: 7,
      points: [
        point(
          code,
          'if (x > 1) {\n        if (x > 2) {\n          console.log(x);\n        }\n      }',
          '+3 (incl. 2 for nesting): if',
          3
        ),
        point(
          code,
          'if (x > 2) {\n          console.log(x);\n        }',
          '+4 (incl. 3 for nesting): if',
          4
        ),
      ],
    });
  });

  it('inherits multiple function levels and unwinds before sibling functions and statements', () => {
    const code = `function outer(flag) {
  if (flag) {
    function middle() {
      if (flag) {
        const inner = () => { if (flag) return 1; };
      }
      if (flag) return 2;
    }
    function sibling() { if (flag) return 3; }
  }
  const later = () => { if (flag) return 4; };
  if (flag) return 5;
}
function topLevel() { if (flag) return 6; }`;
    const results = calculate(code, mode);
    expect([...results].map(([name, result]) => [name, result.total])).toEqual([
      ['inner', 5],
      ['middle', 6],
      ['sibling', 3],
      ['later', 2],
      ['outer', 2],
      ['topLevel', 1],
    ]);
  });

  it('keeps logical operators and recursion flat inside nested functions', () => {
    const code = `function outer(flag) {
  if (flag) {
    function recurse(n) {
      if (n && flag) return recurse(n - 1);
      recurse(n - 2);
    }
  }
}`;
    const results = calculate(code, mode);
    expect(results.get('outer')?.total).toBe(1);
    expect(results.get('recurse')?.total).toBe(5);
    expect(results.get('recurse')?.points.map(({ complexity }) => complexity)).toEqual([3, 1, 1]);
  });

  it('keeps direct function branches from changing nesting after they exit', () => {
    const code = `function outer(flag) {
  const handler = flag ? function branch() { if (flag) return 1; } : () => { if (flag) return 2; };
  if (flag) {
    if (flag) return handler;
  }
}`;
    const results = calculate(code, mode);
    expect([...results].map(([name, result]) => [name, result.total])).toEqual([
      ['branch', 2],
      ['anonymous_2', 2],
      ['outer', 4],
    ]);
  });

  it.each([
    { name: 'top-level class', prefix: '', suffix: '', depth: 0 },
    { name: 'class inside a function', prefix: 'function outer(flag) {', suffix: '}', depth: 1 },
    {
      name: 'class inside control flow',
      prefix: 'function outer(flag) { if (flag) {',
      suffix: '} if (flag) return 0; }',
      depth: 2,
    },
  ])('inherits nesting uniformly for a $name', ({ prefix, suffix, depth }) => {
    const code = `${prefix}
class Example {
  choice = flag ? 1 : 0;
  labels = items.map(function fieldCallback() { if (flag) return 1; });
  static {
    if (flag) ready = true;
    function staticCallback() { if (flag) return 2; }
  }
  handler = (() => { if (flag) return 3; }) as () => number;
  method() { if (flag) return 4; }
}
${suffix}`;
    const results = calculate(code, mode);
    const expected: [string, number][] = [
      ['choice', depth + 1],
      ['fieldCallback', depth + 2],
      ['labels', 0],
      ['staticCallback', depth + 2],
      ['anonymous_5', depth + 1],
      ['handler', depth + 1],
      ['method', depth + 1],
    ];
    if (prefix) expected.push(['outer', depth === 1 ? 0 : 2]);
    expect([...results].map(([name, result]) => [name, result.total])).toEqual(expected);
  });

  it.each([
    { name: 'top level', prefix: '', suffix: '', depth: 0 },
    {
      name: 'inside control flow',
      prefix: 'function outer(flag) { if (flag) {',
      suffix: '} }',
      depth: 2,
    },
  ])(
    'inherits from the enclosing scope for computed keys and decorators at $name',
    ({ prefix, suffix, depth }) => {
      const code = `${prefix}
class Example {
  [flag ? (function keyCallback() { if (flag) return 'x'; })() : 'y'] = flag ? 1 : 0;
  @dec(function decoratorCallback() { if (flag) return 2; }) value = 0;
}
${suffix}`;
      const results = calculate(code, mode);
      expect([...results].map(([name, result]) => [name, result.total])).toEqual([
        ['keyCallback', depth === 0 ? 1 : 4],
        ['anonymous_2', depth + 1],
        ['decoratorCallback', depth + 1],
        ['value', 0],
        ...(prefix ? [['outer', 3]] : []),
      ]);
    }
  );
});
