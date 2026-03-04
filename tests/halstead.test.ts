import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walkWithVisitor } from './utils/test-helpers.js';
import type { ESTreeNode } from '#src/types.js';
import {
  calculateHalsteadMetrics,
  createHalsteadCounts,
  mergeHalsteadCounts,
  type HalsteadCounts,
} from '#src/module/halstead.js';
import { createHalsteadVisitorHandlers } from '#src/module/halstead-visitor.js';

function analyzeHalstead(code: string, filename = 'test.js') {
  const { program } = parseSync(filename, code);
  const { handlers, moduleCounts } = createHalsteadVisitorHandlers();
  const functionResults: HalsteadCounts[] = [];

  // Wrap handlers to capture function exits
  const wrappedHandlers = { ...handlers };
  const origFuncDeclExit = handlers['FunctionDeclaration:exit'];
  const origFuncExprExit = handlers['FunctionExpression:exit'];
  const origArrowExit = handlers['ArrowFunctionExpression:exit'];

  // We need to collect function-level counts via callbacks
  const { handlers: handlers2, moduleCounts: moduleCounts2 } = createHalsteadVisitorHandlers({
    onFunctionExit(counts) {
      functionResults.push(counts);
    },
  });

  walkWithVisitor(program as unknown as ESTreeNode, handlers2, code);

  return {
    moduleCounts: moduleCounts2,
    moduleMetrics: calculateHalsteadMetrics(moduleCounts2),
    functionResults,
  };
}

describe('calculateHalsteadMetrics', () => {
  it('should return zeroes for empty counts', () => {
    const counts = createHalsteadCounts();
    const metrics = calculateHalsteadMetrics(counts);

    expect(metrics.n1).toBe(0);
    expect(metrics.n2).toBe(0);
    expect(metrics.N1).toBe(0);
    expect(metrics.N2).toBe(0);
    expect(metrics.length).toBe(0);
    expect(metrics.vocabulary).toBe(0);
    expect(metrics.volume).toBe(0);
    expect(metrics.difficulty).toBe(0);
    expect(metrics.effort).toBe(0);
    expect(metrics.bugs).toBe(0);
    expect(metrics.time).toBe(0);
  });

  it('should compute correct metrics for known counts', () => {
    const counts = createHalsteadCounts();
    // 2 unique operators, 3 unique operands
    counts.operators.set('+', 3);
    counts.operators.set('=', 2);
    counts.operands.set('a', 4);
    counts.operands.set('b', 2);
    counts.operands.set('1', 1);

    const m = calculateHalsteadMetrics(counts);

    expect(m.n1).toBe(2);
    expect(m.n2).toBe(3);
    expect(m.N1).toBe(5); // 3 + 2
    expect(m.N2).toBe(7); // 4 + 2 + 1
    expect(m.length).toBe(12);
    expect(m.vocabulary).toBe(5);
    expect(m.volume).toBeCloseTo(12 * Math.log2(5), 5);
    expect(m.difficulty).toBeCloseTo((2 / 2) * (7 / 3), 5);
    expect(m.effort).toBeCloseTo(m.difficulty * m.volume, 5);
    expect(m.bugs).toBeCloseTo(m.volume / 3000, 5);
    expect(m.time).toBeCloseTo(m.effort / 18, 5);
  });
});

describe('mergeHalsteadCounts', () => {
  it('should merge source into target', () => {
    const target = createHalsteadCounts();
    target.operators.set('+', 2);
    target.operands.set('a', 1);

    const source = createHalsteadCounts();
    source.operators.set('+', 3);
    source.operators.set('-', 1);
    source.operands.set('b', 2);

    mergeHalsteadCounts(target, source);

    expect(target.operators.get('+')).toBe(5);
    expect(target.operators.get('-')).toBe(1);
    expect(target.operands.get('a')).toBe(1);
    expect(target.operands.get('b')).toBe(2);
  });
});

describe('Halstead visitor', () => {
  it('should classify a simple assignment', () => {
    const { moduleMetrics, moduleCounts } = analyzeHalstead('var x = 1;');

    // Operators: var, =
    expect(moduleCounts.operators.has('var')).toBe(true);
    expect(moduleCounts.operators.has('=')).toBe(true);
    // Operands: x, 1
    expect(moduleCounts.operands.has('x')).toBe(true);
    expect(moduleCounts.operands.has('1')).toBe(true);

    expect(moduleMetrics.n1).toBeGreaterThanOrEqual(2);
    expect(moduleMetrics.n2).toBeGreaterThanOrEqual(2);
  });

  it('should classify binary expressions', () => {
    const { moduleCounts } = analyzeHalstead('var z = a + b * c;');

    expect(moduleCounts.operators.has('+')).toBe(true);
    expect(moduleCounts.operators.has('*')).toBe(true);
    expect(moduleCounts.operands.has('a')).toBe(true);
    expect(moduleCounts.operands.has('b')).toBe(true);
    expect(moduleCounts.operands.has('c')).toBe(true);
  });

  it('should classify control flow', () => {
    const code = `
function test(x) {
  if (x > 0) {
    return x;
  } else {
    return -x;
  }
}`;
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('function')).toBe(true);
    expect(moduleCounts.operators.has('if')).toBe(true);
    expect(moduleCounts.operators.has('else')).toBe(true);
    expect(moduleCounts.operators.has('return')).toBe(true);
    expect(moduleCounts.operators.has('>')).toBe(true);
    expect(moduleCounts.operators.has('-')).toBe(true);
  });

  it('should classify loops', () => {
    const code = `
function test() {
  for (var i = 0; i < 10; i++) {
    while (true) { break; }
  }
}`;
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('for')).toBe(true);
    expect(moduleCounts.operators.has('while')).toBe(true);
    expect(moduleCounts.operators.has('break')).toBe(true);
    expect(moduleCounts.operators.has('++')).toBe(true);
    expect(moduleCounts.operators.has('<')).toBe(true);
  });

  it('should classify arrow functions', () => {
    const { moduleCounts } = analyzeHalstead('const add = (a, b) => a + b;');

    expect(moduleCounts.operators.has('=>')).toBe(true);
    expect(moduleCounts.operators.has('+')).toBe(true);
    expect(moduleCounts.operators.has('const')).toBe(true);
  });

  it('should classify member expressions and calls', () => {
    const code = `
function test() {
  console.log("hello");
  obj?.method();
}`;
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('.')).toBe(true);
    expect(moduleCounts.operators.has('()')).toBe(true);
    expect(moduleCounts.operands.has('console')).toBe(true);
  });

  it('should classify template literals', () => {
    const code = 'const msg = `hello ${name}`;';
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('`')).toBe(true);
  });

  it('should classify spread and rest', () => {
    const code = 'const arr = [...items]; function f(...args) {}';
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('...')).toBe(true);
  });

  it('should classify ternary', () => {
    const code = 'const r = x ? 1 : 0;';
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('?:')).toBe(true);
  });

  it('should classify switch/case/default', () => {
    const code = `
function test(x) {
  switch(x) {
    case 1: break;
    default: break;
  }
}`;
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('switch')).toBe(true);
    expect(moduleCounts.operators.has('case')).toBe(true);
    expect(moduleCounts.operators.has('default')).toBe(true);
  });

  it('should classify new, class, import/export', () => {
    const code = `
class Foo {}
export default Foo;
`;
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('class')).toBe(true);
    expect(moduleCounts.operators.has('export')).toBe(true);
  });

  it('should handle async/await and yield', () => {
    const code = `
async function test() {
  await fetch("url");
}`;
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('await')).toBe(true);
  });

  it('should track per-function Halstead counts', () => {
    const code = `
function foo() { return 1 + 2; }
function bar() { return 3 * 4; }
`;
    const { functionResults } = analyzeHalstead(code);

    expect(functionResults.length).toBe(2);
    // Each function should have its own counts
    expect(functionResults[0].operators.has('return')).toBe(true);
    expect(functionResults[1].operators.has('return')).toBe(true);
  });

  it('should classify this as operand', () => {
    const code = `
function test() {
  return this.value;
}`;
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operands.has('this')).toBe(true);
  });

  it('should classify object and array literals', () => {
    const code = 'const obj = { a: 1 }; const arr = [1, 2];';
    const { moduleCounts } = analyzeHalstead(code);

    expect(moduleCounts.operators.has('{}')).toBe(true);
    expect(moduleCounts.operators.has('[]')).toBe(true);
    expect(moduleCounts.operators.has(':')).toBe(true);
  });
});
