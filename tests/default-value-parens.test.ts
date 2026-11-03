import { parseSync } from 'oxc-parser';
import { describe, it, expect } from 'vitest';
import { createCognitiveVisitor } from '../src/cognitive/visitor.js';
import type { ESTreeNode } from '../src/types.js';
import { walkWithVisitor } from './utils/test-helpers.js';

function cognitiveTotal(code: string, filename: string, preserveParens: boolean): number {
  const { program, errors } = parseSync(filename, code, { preserveParens });
  expect(errors).toEqual([]);
  let total = 0;
  const visitor = createCognitiveVisitor((result) => {
    total += result.total;
  });
  walkWithVisitor(program as unknown as ESTreeNode, visitor, code);
  return total;
}

// The oxlint runtime AST never contains ParenthesizedExpression; tests parse with parentheses.
describe('parenthesized expressions are scored like the oxlint runtime AST', () => {
  it.each([
    ['a ?? (b ?? "x")', 0, 'test.ts'],
    ['a || (b || c)', 1, 'test.ts'],
    ['(a && b) || []', 1, 'test.ts'],
    ['a ?? ([] as const)', 0, 'test.ts'],
    ['cond && (<div />)', 0, 'test.tsx'],
  ])('%s', (expression, expected, filename) => {
    const code = `function f(a, b, c, cond) { return ${expression}; }`;
    const withParens = cognitiveTotal(code, filename, true);
    const withoutParens = cognitiveTotal(code, filename, false);
    expect(withParens).toBe(withoutParens);
    expect(withParens).toBe(expected);
  });
});
