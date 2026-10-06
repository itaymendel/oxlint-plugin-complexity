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

  it('attributes nested-function penalties to the parent in traversal order', () => {
    const code = `function outer(flag) {
  function inner() { if (flag) return 1; }
  const arrow = () => { if (flag) return 2; };
  if (flag) return 3;
}`;
    const results = calculate(code, mode);
    expect([...results.keys()]).toEqual(['inner', 'arrow', 'outer']);
    expect(results.get('outer')).toEqual({
      total: 3,
      points: [
        point(code, 'function inner() { if (flag) return 1; }', '+1: nested function'),
        point(code, '() => { if (flag) return 2; }', '+1: nested arrow function'),
        point(code, 'if (flag) return 3;', '+1: if'),
      ],
    });
    expect(results.get('inner')).toEqual({
      total: 1,
      points: [point(code, 'if (flag) return 1;', '+1: if')],
    });
    expect(results.get('arrow')).toEqual({
      total: 1,
      points: [point(code, 'if (flag) return 2;', '+1: if')],
    });
  });
});
