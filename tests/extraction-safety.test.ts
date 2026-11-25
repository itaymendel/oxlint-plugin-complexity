import { describe, expect, it } from 'vitest';
import { findExtractionCandidates } from '#src/extraction/boundary-detector.js';
import { analyzeVariableFlow } from '#src/extraction/flow-analyzer.js';
import { createExtractionSuggestion } from '#src/extraction/suggestion-generator.js';
import type { ExtractionSuggestion } from '#src/extraction/types.js';
import { getVariablesForFunction } from '#src/extraction/variable-tracker.js';
import { suggestionsOf, visitFunctions, type SourceType } from './utils/real-scopes.js';

/**
 * When a signature is printed, on oxlint's real scopes. Applying each of the `withheld` programs'
 * signatures was once shown, by running the code, to change behavior or not compile; the expected
 * signatures were shown to be equivalent.
 */
interface Program {
  name: string;
  code: string;
  filename?: string;
  sourceType?: SourceType;
}

/** Every candidate block, before ranking drops the ones a nested block beats. */
function allCandidates({ code, filename = 'f.js', sourceType = 'module' }: Omit<Program, 'name'>) {
  const out: ExtractionSuggestion[] = [];
  const options = { minComplexityPercentage: 1, maxComplexityPercentage: 100 };
  visitFunctions(code, filename, sourceType, (context, result, node) => {
    const variables = getVariablesForFunction(context, node);
    if (variables.size === 0) return;
    const { cognitivePoints, cognitive } = result;
    for (const c of findExtractionCandidates(node, cognitivePoints, cognitive, options)) {
      out.push(createExtractionSuggestion(c, analyzeVariableFlow(c, variables, node)));
    }
  });
  return out;
}

const issuesOf = (program: Omit<Program, 'name'>): string[] =>
  allCandidates(program).flatMap((s) => s.issues.map((i) => i.description));

/** Adds complexity, so that the block under test is not the whole function. */
const FILL = "  if (p && q) { log('f1'); } else if (q) { log('f2'); }\n";

/** Whether a signature is printed for a block that covers `line`. */
const signedAt = (code: string, line: number, filename = 'f.js', sourceType?: SourceType) =>
  suggestionsOf(code, filename, {}, sourceType).some(
    (s) => s.suggestedSignature && s.range.start <= line && line <= s.range.end
  );

const WITHHELD: Array<Program & { issue: RegExp }> = [
  {
    name: 'an output used by a closure',
    issue: /'v' is used by a closure/,
    code: `export function f(a, b, p, q) {
${FILL}  const v = a ? (b ? 1 : 2) : 3;
  return () => v;
}
`,
  },
  {
    name: 'a captured `var`, even if never reassigned',
    issue: /'base' is used by a closure/,
    code: `export function f(a, b, n, p, q) {
  var base = n * 2;
${FILL}  if (a) {
    if (b) { setTimeout(() => log(base)); }
  }
}
`,
  },
  {
    name: 'an output also read before the block',
    issue: /'x' is declared in the block but also used outside/,
    code: `export function f(a, b, p, q) {
  log(x);
${FILL}  var x = a ? (b ? 1 : 2) : 3;
  return x;
}
`,
  },
  {
    name: 'a later write seen by a closure (issue case)',
    issue: /'mode' is used by a closure/,
    code: `export function lateWrite(a, b, c) {
  let mode = "on";
  if (a && b) {
    if (c || a) {
      setTimeout(() => log(mode));
    }
  }
  mode = "off";
  return mode;
}
`,
  },
  {
    name: 'a closure called in the block that writes an input',
    issue: /'n' is used by a closure/,
    code: `export function calleeWrites(a, b, c) {
  let n = 0;
  const inc = () => { n++; };
  if (a && b) {
    if (c || a) {
      inc();
      log(n);
    }
  }
  log(n);
}
`,
  },
  {
    name: 'a returned closure over a reassigned variable',
    issue: /'mode' is used by a closure/,
    code: `export function mk(a, b, c) {
  let mode = "on";
  if (a && b) {
    if (c || a) {
      var fn = () => mode;
    }
  }
  mode = "off";
  return fn;
}
`,
  },
  {
    name: 'a captured `var` loop counter',
    issue: /'i' is used by a closure/,
    code: `const store = [];
function keep(g) { store.push(g); }
export function f(n, b, p, q) {
  let cnt = 0;
  if (p && q) { log('f1'); } else if (q) { log('f2'); }
  for (var i = 0; i < n; i++) {
    cnt++;
    if (i >= 0 || b) {
      keep(() => i);
    }
  }
  return store.map((g) => g());
}
`,
  },
  {
    name: 'a write through `satisfies` in a closure',
    issue: /'x' is used by a closure/,
    code: `export function f(a: boolean, b: boolean, p: boolean, q: boolean) {
  let x: number = 0;
  const set = () => { (x satisfies number) = 5; };
  if (p && q) { log('f1'); } else if (q) { log('f2'); }
  if (a) {
    if (p) { log(x); set(); }
    if (b) { log(x); }
  }
  return x;
}
`,
    filename: 'case.ts',
  },
  {
    name: 'a constant declared after the block',
    issue: /'limit' is used here but declared after/,
    code: `export function lateConst(a, b, c) {
  if (a && b) {
    if (c || a) {
      setTimeout(() => log(limit));
    }
  }
  const limit = 5;
  return limit;
}
`,
  },
  {
    name: 'a function declared after the block',
    issue: /'show' is used here but declared after/,
    code: `export function laterFn(a, b, c, xs) {
  if (a && b) {
    if (c || a) {
      for (const x of xs) { show(x); }
    }
  }
  function show(v) { log(v); }
}
`,
  },
  {
    name: 'an input a switch case can leave uninitialized',
    issue: /'z' may not be initialized/,
    code: `export function f(k, a, b) {
  switch (k) {
    case 0:
      let z = 1;
      log(z);
      break;
    case 1:
      if (a) {
        if (b) { log(z); }
      }
      log('done');
  }
}
`,
  },
  {
    name: 'a type naming a function generic',
    issue: /The type of 'items' uses 'T'/,
    code: `export function firstOf<T>(items: T[], a: boolean, b: boolean): void {
  if (a && b) {
    for (const it of items) {
      if (it || a) {
        log(it, items.length);
      }
    }
  }
}
`,
    filename: 'case.ts',
  },
  {
    name: 'a type naming a local alias',
    issue: /The type of 'p' uses 'Pair'/,
    code: `export function withLocalType(xs: number[], a: boolean, b: boolean): void {
  type Pair = [number, number];
  const p: Pair = [1, 2];
  if (a && b) {
    for (const x of xs) {
      if (x || a) {
        log(p[0] + x);
      }
    }
  }
}
`,
    filename: 'case.ts',
  },
  {
    name: 'a `var` read before the block',
    issue: /'x' is declared in the block but also used outside/,
    code: `export function f(a, b, p, q) {
  log(x);
  if (p && q) { log('f1'); } else if (q) { log('f2'); }
  var x = a && b ? 1 : 2;
}
`,
  },
  {
    name: 'a `var` that shares its name with a function',
    issue: /'g' is declared in the block and more than once/,
    code: `export function f(a, b, p, q) {
  if (p && q) { log('f1'); } else if (q) { log('f2'); }
  if (a) {
    var g = b ? 1 : 2;
  }
  return typeof g;
  function g() {}
}
`,
  },
  {
    name: 'a function declaration used after the block',
    issue: /'g' is a function declaration used outside/,
    code: `export function f(k, a, b) {
  switch (k) {
    case 0:
      function g() { return 7; }
      if (a) { log('zero'); } else if (b) { log('one'); }
      break;
    case 1:
      log(g());
      if (a && b) { log(2); }
  }
}
`,
  },
  {
    name: 'an output read in `catch` (issue case)',
    issue: /'v' is set by the block inside a try/,
    code: `export function catchVar(items) {
  try {
    if (items.length) {
      var v = items.map((i) => i.x).filter(Boolean).length;
      mayThrow(v);
    }
  } catch (e) {
    console.log(v);
  }
}
`,
  },
  {
    name: 'an output read in `finally`',
    issue: /'total' is set by the block inside a try/,
    code: `export function finallyRead(items, a) {
  try {
    if (items.length) {
      if (a || items[0]) {
        var total = 0;
        for (const i of items) {
          if (i > 1) { total += i; }
        }
        mayThrow(total);
      }
    }
  } finally {
    log(total);
  }
}
`,
  },
  {
    name: 'a `var` declared in a loop (issue case)',
    issue: /'var acc' is declared in a loop/,
    code: `export function varLoop(a, b, c, xs) {
  for (const x of xs) {
    if (a && b) {
      if (c || x) { var acc = x; }
      log(acc);
    }
  }
}
`,
  },
  {
    name: 'direct `eval`',
    issue: /Direct eval/,
    code: `export function evalLocal(a, b, c) {
  const secret = 7;
  if (a && b) {
    if (c || a) {
      log(eval("secret"));
    }
  }
  return secret;
}
`,
  },
  {
    name: 'a parameter aliased by `arguments` in sloppy code',
    issue: /the two alias each other/,
    code: `function f(a, b) {
  const set = () => { arguments[0] = 9; };
  if (b) { log('x'); } else if (a) { log('y'); }
  if (a) {
    log(a);
    if (b) { set(); }
    log(a);
  }
}
`,
    sourceType: 'script',
  },
  {
    name: 'a function in a nested block in sloppy code',
    issue: /declared in a nested block/,
    code: `function f(a, b, p, q) {
  if (a) {
    function g() { return 1; }
    if (b) { log('b'); }
  }
  if (p && q) { log('f1'); } else if (q) { log('f2'); }
  return typeof g === 'function' ? g() : 'none';
}
`,
    sourceType: 'script',
  },
  {
    name: 'strict code that would move to a sloppy script',
    issue: /would be sloppy/,
    code: `function g(o, a, p, q) {
  'use strict';
  if (p && q) { log('f1'); } else if (q) { log('f2'); }
  if (a) {
    const cfg = Object.freeze({ n: o });
    cfg.n = 2;
    if (p) { log(cfg.n); }
  }
  return 1;
}
function f(o, a, p, q) { try { return g(o, a, p, q); } catch (e) { return 'threw ' + e.name; } }
`,
    sourceType: 'script',
  },
  {
    name: 'a `#private` name',
    issue: /`#private`/,
    code: `export class Counter {
  #n = 0;
  merge(other: Counter, a: boolean, b: boolean): number {
    if (a && b) {
      if (other || a) {
        log(other.#n);
      }
    }
    return other.#n;
  }
}
`,
    filename: 'case.ts',
  },
  {
    name: '`with`',
    issue: /`with` makes name resolution dynamic/,
    code: `function f(o, a, b) {
  with (o) { log(x); }
  if (a) {
    if (b) { log(a); }
  }
}
`,
    sourceType: 'script',
  },
  {
    name: '`using`',
    issue: /`using`/,
    code: `export function f(a, b, p, q) {
${FILL}  if (a) {
    if (b) {
      using res = open(q);
      if (res || p) { log(res); }
    }
  }
}
`,
  },
];

const SIGNED: Array<Program & { signature: string }> = [
  {
    name: 'same-named variables (issue case)',
    signature: 'extracted(b, item): void',
    code: `export function sameName(a, b, xs, ys) {
  for (const item of xs) {
    log(item);
  }
  for (const item of ys) {
    if (a && b) {
      if (b || item) { log(item); }
    }
  }
}
`,
  },
  {
    name: 'same-named constants in sibling blocks',
    signature: 'extracted(els, a, convertedElements): void',
    code: `export function convert(els, a, b) {
  if (els.length) {
    const convertedElements = els.map((e) => e + 1);
    log(convertedElements);
  }
  if (a) {
    const convertedElements = els.map((e) => e * 2);
    if (b) {
      if (a || els.length) {
        log(convertedElements);
      }
    }
  }
}
`,
  },
  {
    name: 'a parameter name inside a function type',
    signature: 'extracted(a: boolean, item: number): void',
    code: `export function f(items: number[], pred: (item: number) => boolean, a: boolean) {
  for (let i: number = 0; i < items.length; i++) {
    const item: number = items[i];
    if (a && pred(item)) {
      if (a || item) {
        log(item);
      }
    }
  }
}
`,
    filename: 'case.ts',
  },
  {
    name: 'a same-named catch parameter',
    signature: 'extracted(a, e): void',
    code: `export function catches(a, b) {
  try {
    mayThrow(1);
  } catch (e) {
    log(e.message);
  }
  try {
    mayThrow(2);
  } catch (e) {
    if (a && b) {
      if (e || a) {
        log(e.message);
      }
    }
  }
}
`,
  },
  {
    name: 'a parameter shadowed by a loop variable',
    signature: 'extracted(b, y): void',
    code: `export function shadowed(a, b, x, y) {
  if (a) {
    for (const y of [x, 2]) {
      if (b) {
        if (y > 1) {
          log(y);
        }
      }
    }
  }
  return y;
}
`,
  },
  {
    name: 'a captured constant',
    signature: 'extracted(a, add, x): void',
    code: `export function closureConst(xs, a, b) {
  const base = 10;
  const add = (x) => x + base;
  if (a && b) {
    for (const x of xs) {
      if (x || a) {
        log(add(x));
      }
    }
  }
}
`,
  },
  {
    name: 'a `var` output',
    signature: 'extracted(xs, a)',
    code: `export function varOutput(xs, a, b) {
  if (a) { log("a"); } else if (b) { log("b"); }
  if (a && b) {
    if (xs.length || a) {
      for (const x of xs) { log(x); }
      var total = xs.length;
    }
  }
  return total;
}
`,
  },
  {
    name: 'an output reassigned after the block',
    signature: 'extracted(a, b, c, xs)',
    code: `export function letOut(a, b, c, xs) {
  if (a) { log("a"); } else if (b) { log("b"); }
  let v =
    a
      ? b
        ? xs.length
        : 2
      : c;
  v = v + 1;
  log(v);
  return v;
}
`,
  },
  {
    name: 'destructured parameters',
    signature: 'extracted(a, c, d): void',
    code: `export function destructured({ a, b }, [c, d]) {
  if (a && b) {
    if (c || d) {
      log(c, d, a);
    }
  }
  return b;
}
`,
  },
  {
    name: 'module-level functions',
    signature: 'extracted(a, x): void',
    code: `function double(x) { return x * 2; }
export function moduleCalls(xs, a, b) {
  if (a && b) {
    for (const x of xs) {
      if (x || a) {
        log(double(x));
      }
    }
  }
}
`,
  },
  {
    name: 'a whole `try` inside the block',
    signature: 'extracted(xs): void',
    code: `export function tryInside(xs, a, b) {
  if (a && b) {
    if (xs.length || a) {
      let result = "none";
      try {
        result = xs.map((x) => x.v).join(",");
        mayThrow(result);
      } catch (e) {
        log("caught", result);
      } finally {
        log("done");
      }
    }
  }
}
`,
  },
  {
    name: 'a function declaration used only in the block',
    signature: 'extracted(a, b): void',
    code: `export function f(k, a, b) {
  switch (k) {
    case 0:
      function g() { return 7; }
      if (a) { log('zero', g()); } else if (b) { log('one'); }
      break;
    case 1:
      if (a && b) { log(2); }
  }
}
`,
  },
  {
    name: 'a class method in a script',
    signature: 'extracted(xs, a, p): void',
    code: `class K {
  static m(xs, a, p, q) {
  if (p && q) { log('f1'); } else if (q) { log('f2'); }
    if (a) {
      log(xs.length, xs[0]);
      if (p) { log('done'); }
    }
    return 1;
  }
}
function f(xs, a, p, q) { return K.m(xs, a, p, q); }
`,
    sourceType: 'script',
  },
  {
    name: 'an annotated output',
    signature: 'extracted(a: boolean, b: boolean, c: number, xs: number[]): number',
    code: `export function typedOut(a: boolean, b: boolean, c: number, xs: number[]) {
  if (a) { log("a"); } else if (b) { log("b"); }
  const v: number =
    a
      ? b
        ? xs.length
        : 2
      : c;
  log(v);
  return v;
}
`,
    filename: 'case.ts',
  },
];

describe('signatures are withheld for', () => {
  it.each(WITHHELD)('$name', ({ issue, ...program }) => {
    expect(issuesOf(program).join('\n')).toMatch(issue);
  });

  it('sloppy-mode hazards only in sloppy code', () => {
    const program = WITHHELD.find((w) => w.name.includes('aliased by `arguments`'))!;
    expect(issuesOf({ code: program.code }).join('\n')).not.toMatch(program.issue);
  });
});

describe('signatures are printed for', () => {
  it.each(SIGNED)('$name', ({ signature, code, filename = 'f.js', sourceType }) => {
    const signatures = suggestionsOf(code, filename, {}, sourceType).map(
      (s) => s.suggestedSignature
    );
    expect(signatures).toContain(signature);
  });
});

describe('writes through type wrappers', () => {
  const body = (write: string): string =>
    `export function f(a: boolean, b: boolean, p: boolean, q: boolean) {
  let x: number | undefined = 0;
${FILL}  if (a) {
    ${write};
    if (b) { log(x); }
  }
  return x;
}
`;

  it.each([
    ['satisfies', '(x satisfies number) = 5'],
    ['as', '(x as number) = 5'],
    ['non-null', 'x! = 5'],
    ['type assertion', '(<number>x) = 5'],
    ['parentheses', '((x)) = 5'],
    ['satisfies compound', '(x satisfies number) += 5'],
    ['satisfies update', '(x satisfies number)++'],
    ['non-null update', 'x!++'],
    ['satisfies in destructuring', '[x satisfies number] = [5]'],
    ['as in destructuring', '[x as number] = [5]'],
  ])('sees a write through %s', (_name, write) => {
    // x is assigned in the block and read after it: no signature may leave that unsaid
    expect(signedAt(body(write), 5, 'case.ts')).toBe(false);
  });

  it('still prints a signature when the wrapped variable is only read', () => {
    const code = body('log(x satisfies number | undefined, x as number, x!)');
    expect(signedAt(code, 5, 'case.ts')).toBe(true);
  });
});

describe('this as a JSX tag root', () => {
  const code = (tag: string): string => `class V {
  Row() {}
  render(a, b, p, q) {
${FILL}    if (a) {
      log(<${tag} x={1} />);
      if (b) { log(<${tag} x={2} />); }
    }
  }
}
`;

  it('treats <this.Row /> as a use of this', () => {
    const program = { code: code('this.Row'), filename: 'case.jsx' };
    expect(issuesOf(program).join('\n')).toContain('`this`');
  });

  it('does not treat another tag root as this', () => {
    const local = `export function f(a, b, p, q) {
  const row = { Sub() {} };
${FILL}  if (a) {
    log(<row.Sub x={1} />);
    if (b) { log(<row.Sub x={2} />); }
  }
}
`;
    expect(signedAt(local, 4, 'case.jsx')).toBe(true);
  });
});

describe('strict mode in a sloppy script', () => {
  const inClass = (inner: string): string => `class K {
  static m(o, a, p, q) {
${FILL}    if (a) {
      ${inner}
      if (p) { log('done'); }
    }
  }
}
`;
  const withheld = (code: string, sourceType: SourceType = 'script'): boolean =>
    !signedAt(code, 5, 'case.js', sourceType);

  it.each([
    ['an undeclared name', 'totl = o + 1;'],
    ['a property write', 'const c = Object.freeze({ n: 1 }); c.n = 2;'],
    ['a property update', 'const c = Object.freeze({ n: 1 }); c.n++;'],
    ['a destructuring target', 'const c = Object.freeze({ n: 1 }); [c.n] = [2];'],
    ['a loop target', 'const c = Object.freeze({ n: 1 }); for (c.n of [2]) log(c.n);'],
    ['a delete', 'const c = Object.freeze({ n: 1 }); delete c.n;'],
    ['this of a plain function', 'log([1].map(function () { return typeof this; }));'],
    ['arguments of a nested function', 'log((function (v) { return arguments.length; })(1));'],
  ])('withholds %s in a class body', (_name, inner) => {
    const code = inClass(inner);
    expect(withheld(code)).toBe(true);
  });

  it('keeps the signature when strictness cannot matter', () => {
    // nothing in the block depends on strict mode
    expect(withheld(inClass('log(o.length, o[0]);'))).toBe(false);
    // arrow functions keep the `this` of the function, which is withheld on its own
    expect(withheld(inClass('log([1].map((v) => v + 1));'))).toBe(false);
    // writes to bindings are plain assignments in both modes
    expect(withheld(inClass('let v = 1; v = 2; log(v);'))).toBe(false);
  });

  it('only fires where the helper would be sloppy and the function is not', () => {
    const code = inClass('totl = o + 1;');
    const sloppy = `function g(o, a, p, q) {
${FILL}  if (a) {
    totl = o + 1;
    if (p) { log('done'); }
  }
}
`;
    for (const program of [
      { code },
      { code: `'use strict';\n${code}`, sourceType: 'script' as const },
      { code: sloppy, sourceType: 'script' as const },
    ]) {
      expect(issuesOf(program).join('\n')).not.toContain('would be sloppy');
    }
  });
});

describe('reporting', () => {
  it('reports one issue for a block, even when several bindings are unavailable', () => {
    const code = `export function f(a, b, c, xs) {
  if (a && b) {
    for (const x of xs) {
      if (x || c) { log(l1, l2, l3, l4, l5); }
    }
  }
  const l1 = 1, l2 = 2, l3 = 3, l4 = 4, l5 = 5;
}
`;
    const [first] = suggestionsOf(code, 'f.js');
    expect(first.issues).toHaveLength(1);
    expect(first.issues[0]).toMatchObject({ variable: 'l1' });
  });

  it('does not repeat outer-function bindings in a nested function', () => {
    const code = `export function outer(items, c) {
  const p = 1, q = 2, r = 3;
  return items.map((a, b) => {
    if (a && b) {
      for (const x of items) {
        if (x || c) { log(p, q, r); }
      }
    }
    return a;
  });
}
`;
    const issues = suggestionsOf(code, 'f.js')
      .flatMap((s) => s.issues.map((i) => i.description))
      .join('\n');
    expect(issues).not.toContain('not available to a helper');
    expect(issues).toContain('Inside a nested function');
  });
  it('prints type notes except in JavaScript files', () => {
    const untyped = `export function f(xs, a, b) {
  const doubled = xs.map((x) => x * 2);
  if (a && b) {
    for (const d of doubled) {
      if (d || a) { log(d, doubled.length); }
    }
  }
}
`;

    const notes = (filename: string): string =>
      suggestionsOf(untyped, filename)
        .flatMap((s) => s.typeNotes ?? [])
        .join();
    expect(notes('f.ts')).toContain('(inferred');
    expect(notes('f.js')).toBe('');
  });
});

describe('code in class heads', () => {
  const withFill = (inner: string, head = 'function f(a, b, p, q)'): string => `${head} {
  if (p && q) { log('f1'); } else if (q) { log('f2'); }
  if (a) {
    ${inner}
  }
}
`;

  it('sees this, await and arguments in a class computed key and extends clause', () => {
    const issues = (declaration: string, head?: string): string =>
      issuesOf({ code: withFill(`${declaration}\n    if (b) { log(typeof K); }`, head) }).join(
        '\n'
      );
    for (const declaration of [
      'class K { [this.name]() {} }',
      'class K { [arguments[0]]() {} }',
      'class K extends this.Base {}',
    ]) {
      expect(issues(declaration), declaration).toContain('`this`');
    }
    expect(issues('class K { [await load()]() {} }', 'async function f(a, b, p, q)')).toContain(
      'Contains await'
    );
    expect(issues('class K { v = this.constructor.name; static { this.w = 1; } }')).not.toContain(
      '`this`'
    );
  });
});
