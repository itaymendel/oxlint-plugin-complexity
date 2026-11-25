import { describe, expect, it } from 'vitest';
import { parseSync } from 'oxc-parser';
import { PERMISSIVE_OPTIONS as OPTIONS, analyze } from './utils/real-scopes.js';
import { parseAndPrepareAst } from './utils/test-helpers.js';
import { collapseTypeText, printDeclaredType } from '#src/extraction/type-text.js';
import { createExtractionSuggestion } from '#src/extraction/suggestion-generator.js';
import { formatExtractionSuggestions } from '#src/extraction/formatter.js';
import type { ESTreeNode } from '#src/types.js';
import type {
  ExtractionCandidate,
  ExtractionSuggestion,
  VariableFlowAnalysis,
} from '#src/extraction/types.js';

/** Suggestions for `function f(<params>) { ...a block that reads `use`... }` in a .ts file. */
function suggestParams(prelude: string, params: string, use: string): ExtractionSuggestion[] {
  const code = `${prelude}
export function f(${params}, a: boolean, b: boolean) {
  if (a && b) {
    for (const k of [1, 2]) {
      if (k > 1) { log(${use}); }
    }
  }
}
`;
  return analyze(code, 'f.ts', OPTIONS).flatMap((r) => r.suggestions);
}

const signed = (
  suggestions: ExtractionSuggestion[],
  wanted: (s: ExtractionSuggestion) => boolean = () => true
): ExtractionSuggestion => suggestions.find((s) => s.suggestedSignature && wanted(s))!;

const hasOutput = (s: ExtractionSuggestion): boolean => s.outputs.some((o) => o.name === 'v');

/** Unit-level: the printed type of the first parameter of `function f(<param>) {}`. */
function printed(param: string): string | undefined {
  const code = `function f(${param}) {}`;
  const { program } = parseAndPrepareAst(code, 'p.ts');
  const fn = (program as unknown as { body: Array<{ params: ESTreeNode[] }> }).body[0];
  let target = fn.params[0] as unknown as Record<string, unknown>;
  if (target.type === 'RestElement') target = target.argument as Record<string, unknown>;
  if (target.type === 'AssignmentPattern') target = target.left as Record<string, unknown>;
  return printDeclaredType(code, target as unknown as ESTreeNode);
}

describe('types are printed from the source text', () => {
  it('keeps generics, unions, readonly, function and template literal types verbatim', () => {
    expect(printed('x: Array<number>')).toBe('Array<number>');
    expect(printed("x: Exclude<'a' | 'b' | 'c', 'a'>")).toBe(
      "Exclude<'a' | 'b' | 'c'>".replace("'c'>", "'c', 'a'>")
    );
    expect(printed('x: Partial<Record<string, Foo<number>>>')).toBe(
      'Partial<Record<string, Foo<number>>>'
    );
    expect(printed('x: readonly string[]')).toBe('readonly string[]');
    expect(printed('x: (n: number, ...rest: string[]) => void')).toBe(
      '(n: number, ...rest: string[]) => void'
    );
    expect(printed('x: `a-${string}`')).toBe('`a-${string}`');
    expect(printed('x: string | undefined')).toBe('string | undefined');
  });

  it('collapses a multi-line object type without joining its members or touching strings', () => {
    expect(
      printed("x: {\n    a: 'x  y' // note\n    b: number /* c */\n    readonly c?: string;\n  }")
    ).toBe("{ a: 'x  y'; b: number; readonly c?: string }");
    expect(printed('x: {\n  nested: {\n    k: number\n    l: string\n  }\n}')).toBe(
      '{ nested: { k: number; l: string } }'
    );
    expect(printed('x: {}')).toBe('{}');
    expect(collapseTypeText('\'a // not a comment\'  |\n  "b /* nor this */"')).toBe(
      '\'a // not a comment\' | "b /* nor this */"'
    );
  });

  it('drops a leading | or & when folding a multi-line union or intersection', () => {
    expect(printed('x: (\n  | A.B\n  | C<D>\n)[]')).toBe('(A.B | C<D>)[]');
    expect(printed('x:\n  | { a: 1 }\n  | { b: 2 }')).toBe('{ a: 1 } | { b: 2 }');
    expect(printed('x: Array<\n  & P\n  & Q\n>')).toBe('Array<P & Q>');
    expect(printed('x: (n: number, s: string) => void')).toBe('(n: number, s: string) => void');
    expect(printed('x: A | B')).toBe('A | B');
  });

  it('handles optional, rest, default and destructured parameters deliberately', () => {
    expect(printed('x?: number')).toBe('number | undefined');
    expect(printed('x?: (n: number) => void')).toBe('((n: number) => void) | undefined');
    expect(printed('...args: number[]')).toBe('number[]');
    expect(printed('x: number = 3')).toBe('number');
    expect(printed('x = 3')).toBeUndefined();
  });

  it('prints the same text in the signature and in the Inputs line', () => {
    const suggestion = signed(
      suggestParams(
        '',
        'items: Array<number>, pick: (n: number) => boolean',
        'items.length, pick(k)'
      )
    );
    expect(suggestion.suggestedSignature).toContain('items: Array<number>');
    expect(suggestion.suggestedSignature).toContain('pick: (n: number) => boolean');
    const text = formatExtractionSuggestions([suggestion]);
    expect(text).toContain('Inputs: items: Array<number>, pick: (n: number) => boolean');
  });
});

describe('results and type notes', () => {
  const output = (declaration: string): ExtractionSuggestion[] =>
    analyze(
      `export function g(a: boolean, b: boolean, c: number, xs: number[]) {
  if (a) { log("a"); } else if (b) { log("b"); }
  ${declaration}
  log(v);
  return v;
}
`,
      'g.ts',
      OPTIONS
    ).flatMap((r) => r.suggestions);

  it('omits the return type of an inferred output, never printing unknown', () => {
    const suggestion = signed(
      output('const v =\n    a\n      ? b\n        ? xs.length\n        : 2\n      : c;'),
      hasOutput
    );
    expect(suggestion.suggestedSignature).toBe(
      'extracted(a: boolean, b: boolean, c: number, xs: number[])'
    );
    expect(suggestion.typeNotes).toEqual(['Check types: v (inferred; return type omitted)']);
    expect(formatExtractionSuggestions([suggestion])).not.toContain('unknown');
  });

  it('keeps an annotated output and prints no note for a fully annotated block', () => {
    const suggestion = signed(
      output('const v: number =\n    a\n      ? b\n        ? xs.length\n        : 2\n      : c;'),
      hasOutput
    );
    expect(suggestion.suggestedSignature).toBe(
      'extracted(a: boolean, b: boolean, c: number, xs: number[]): number'
    );
    expect(suggestion.typeNotes).toBeUndefined();
    expect(formatExtractionSuggestions([suggestion])).not.toContain('Check types');
  });

  it('prints void for no outputs, and one note line per kind after the signature', () => {
    const code = `export function f(v: string | number, untyped = 1, { p, q }: { p: number; q: string }, a: boolean, b: boolean) {
  if (typeof v === 'string') {
    if (a && b) {
      for (const k of [1, 2]) {
        if (k > 1) { log(v, untyped, p, q); }
      }
    }
  }
}
`;
    const suggestion = signed(analyze(code, 'f.ts', OPTIONS).flatMap((r) => r.suggestions));
    expect(suggestion.suggestedSignature).toMatch(/\): void$/);
    expect(suggestion.suggestedSignature).toContain('v: string | number');
    expect(suggestion.typeNotes).toEqual([
      'Check types: untyped, p, q (inferred)',
      'Check types: v (may be narrowed)',
    ]);
    const lines = formatExtractionSuggestions([suggestion]).split('\n');
    const at = lines.findIndex((l) => l.includes('Suggested:'));
    expect(lines[at + 1]).toContain('Check types: untyped, p, q (inferred)');
    expect(lines[at + 2]).toContain('Check types: v (may be narrowed)');
  });

  it('labels a clean block, and says to check types when notes are printed', () => {
    const typed = `export function f(x: number, a: boolean, b: boolean) {
  if (a && b) {
    if (x || a) { log(x); }
  }
}
`;
    const clean = formatExtractionSuggestions(
      analyze(typed, 'f.ts', OPTIONS).flatMap((r) => r.suggestions)
    );
    expect(clean).toContain('No extraction hazards found\n');
    expect(clean).not.toContain('check the types');
    const noted = formatExtractionSuggestions([signed(suggestParams('', 'x = 1', 'x'))]);
    expect(noted).toContain('No extraction hazards found, but check the types listed below');
    expect(noted).toMatch(/Check types: .*\bx\b.*\(inferred\)/);
    expect(`${clean}${noted}`).not.toContain('Extractable with minimal changes');
  });

  it('notes an optional parameter that a guard may have narrowed', () => {
    const code = `export function f(a: boolean, b: boolean, xs: number[], x?: string): void {
  if (!x) return;
  if (a && b) {
    for (const n of xs) {
      if (n || a) { use(x, n); }
    }
  }
}
`;
    const notes = (source: string) =>
      analyze(source, 'f.ts', OPTIONS)
        .flatMap((r) => r.suggestions)
        .flatMap((s) => s.typeNotes ?? [])
        .join();
    expect(notes(code)).toContain('x (may be narrowed)');
    expect(notes(code.replace('x?:', 'x:'))).not.toContain('may be narrowed');
  });

  it('never prints notes without a signature, and never lets them lower confidence', () => {
    const base = signed(suggestParams('', 'x: number', 'x'));
    expect(base.confidence).toBe('high');
    const withNote = signed(suggestParams('', 'x = 1', 'x'));
    expect(withNote.typeNotes).toBeDefined();
    expect(withNote.confidence).toBe(base.confidence);
    expect(withNote.issues).toEqual([]);
    const withheld = suggestParams('', 'x = 1', 'x, this').find((s) => !s.suggestedSignature);
    expect(withheld).toBeDefined();
    expect(withheld?.typeNotes).toBeUndefined();
  });

  it('writes several typed outputs as an object type, and leaves it out when one is untyped', () => {
    const candidate = {
      startLine: 1,
      endLine: 2,
      complexity: 1,
      complexityPercentage: 50,
      points: [],
      constructs: [],
    } as ExtractionCandidate;
    const flow = (
      outputs: Array<{ name: string; typeAnnotation?: string }>
    ): VariableFlowAnalysis =>
      ({
        inputs: [],
        outputs,
        mutations: [],
        hasEarlyReturn: false,
        hasThisReference: false,
      }) as unknown as VariableFlowAnalysis;
    expect(
      createExtractionSuggestion(
        candidate,
        flow([
          { name: 'a', typeAnnotation: 'A' },
          { name: 'b', typeAnnotation: 'B[]' },
        ])
      ).suggestedSignature
    ).toBe('extracted(): { a: A, b: B[] }');
    expect(
      createExtractionSuggestion(
        candidate,
        flow([{ name: 'a', typeAnnotation: 'A' }, { name: 'b' }])
      ).suggestedSignature
    ).toBe('extracted()');
  });
});

describe('type names still decide whether a signature is given', () => {
  const prelude = `type Foo = { n: number };
declare namespace NS { type Bar = string }
type Pick1<T> = T extends (infer U)[] ? U : never;
`;
  const issues = (params: string, use: string): string[] =>
    suggestParams(prelude, params, use).flatMap((s) => s.issues.map((i) => i.description));
  const given = (params: string, use: string): boolean =>
    suggestParams(prelude, params, use).some((s) => s.suggestedSignature);

  it('accepts module-level, qualified and global names', () => {
    expect(given('x: Foo, y: NS.Bar, z: Map<string, Foo>', 'x, y, z')).toBe(true);
  });
  it('accepts names the type declares itself: function parameters, infer, mapped keys', () => {
    expect(given('f: (item: number) => void', 'f')).toBe(true);
    expect(given('p: Pick1<number[]>, m: { [K in keyof Foo]: Foo[K] }', 'p, m')).toBe(true);
    expect(given('g: <T>(v: T) => T', 'g')).toBe(true);
  });
  it('withholds a type that mentions a function generic, a local type or a typeof of a local', () => {
    // A block gets one issue, so the generic is only present where it is the one under test
    const code = (
      declaration: string,
      generic = ''
    ) => `export function h${generic}(items: ${generic ? 'T' : 'number'}[], a: boolean, b: boolean) {
  ${declaration}
  if (a && b) {
    for (const k of items) {
      if (k) { log(local, items); }
    }
  }
}
`;
    const all = (source: string) => analyze(source, 'h.ts', OPTIONS).flatMap((r) => r.suggestions);
    expect(
      all(code('const local: number = 1;', '<T>'))
        .flatMap((s) => s.issues)
        .some((i) => i.description.includes("uses 'T'"))
    ).toBe(true);
    expect(
      all(code('type Local = number; const local: Local = 1;'))
        .flatMap((s) => s.issues)
        .some((i) => i.description.includes("uses 'Local'"))
    ).toBe(true);
    expect(
      all(code('const base = 1; const local: typeof base = 1;'))
        .flatMap((s) => s.issues)
        .some((i) => i.description.includes("uses 'base'"))
    ).toBe(true);
  });
  it('accepts the name of the enclosing module-level class in a method parameter type', () => {
    const code = `export class Counter {
  n = 0;
  merge(other: Counter, a: boolean, b: boolean): number {
    if (a && b) {
      for (const k of [1, 2]) {
        if (k > 1) { log(other.n, k); }
      }
    }
    return other.n;
  }
}
`;
    const found = analyze(code, 'c.ts', OPTIONS).flatMap((r) => r.suggestions);
    expect(found.some((s) => s.suggestedSignature?.includes('other: Counter'))).toBe(true);
  });
  it('withholds a `this` type', () => {
    const code = `export class C {
  m(self: this, a: boolean, b: boolean) {
    if (a && b) {
      for (const k of [1, 2]) {
        if (k > 1) { log(self); }
      }
    }
  }
}
`;
    const found = analyze(code, 'c.ts', OPTIONS)
      .flatMap((r) => r.suggestions)
      .flatMap((s) => s.issues);
    expect(found.some((i) => i.description.includes('`this`'))).toBe(true);
  });
  it('is not affected by the printing: issues are reported, no `unknown` appears', () => {
    expect(issues('x: Foo', 'x').join('')).not.toContain('unknown');
  });
});
