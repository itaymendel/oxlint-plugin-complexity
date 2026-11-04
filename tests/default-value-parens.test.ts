import { describe, it, expect } from 'vitest';
import { analyzeFileComplexity } from '#src/standalone.js';

function scores(code: string, filename = 'test.ts'): Record<string, number> {
  const { functions } = analyzeFileComplexity(code, filename);
  return Object.fromEntries(functions.map((fn) => [fn.name, fn.cognitive]));
}

// oxlint's runtime AST never contains ParenthesizedExpression, so standalone/diff must not either.
describe('standalone scores parenthesized code like the lint rule', () => {
  it.each([
    ['a ?? (b ?? "x")', 0, 'test.ts'],
    ['(a ?? b) ?? "x"', 0, 'test.ts'],
    ['a || (b || c)', 1, 'test.ts'],
    ['(a || b) || c', 1, 'test.ts'],
    ['(a && b) || []', 1, 'test.ts'],
    ['a ?? ([] as const)', 0, 'test.ts'],
    ['n ?? -(1)', 0, 'test.ts'],
    ['cond && (<div />)', 0, 'test.tsx'],
  ])('%s', (expression, expected, filename) => {
    const code = `function f(a, b, c, n, cond) { return ${expression}; }`;
    expect(scores(code, filename)).toEqual({ f: expected });
  });

  it('counts a parenthesized recursive callee', () => {
    expect(scores('function foo(a){ return (foo)(a) }')).toEqual({ foo: 1 });
  });

  it('scores a parenthesized arrow in a ternary branch', () => {
    const code = 'function f(c,x){ return c ? (() => { if (x) {} }) : 1 }';
    // f scores 1 for the ternary; the arrow in the branch scores 2 (if + 1 nesting)
    expect(Object.values(scores(code)).sort()).toEqual([1, 2]);
  });

  it('applies the condition limit through parentheses', () => {
    expect(scores('function f(a,b){ if ((a || b || false)) {} }').f).toBe(2);
    expect(scores('function f(a){ if ((a ?? false)) {} }').f).toBe(1);
  });
});
