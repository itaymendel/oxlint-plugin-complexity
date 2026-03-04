import { describe, it, expect } from 'vitest';
import { parseAndPrepareAst, walkWithVisitor, createMockContext } from './utils/test-helpers.js';
import type { ESTreeNode } from '#src/types.js';
import { createModuleAnalysisVisitor } from '#src/module/visitor.js';
import {
  calculateModuleComplexity,
  computeMIInputs,
  type ModuleAnalysisResult,
} from '#src/module/visitor.js';

function analyzeModule(code: string, filename = 'test.js'): ModuleAnalysisResult {
  const { program } = parseAndPrepareAst(code, filename);
  const context = createMockContext(program);
  let result: ModuleAnalysisResult | undefined;

  const visitor = createModuleAnalysisVisitor(
    context,
    (r) => {
      result = r;
    },
    undefined,
    {}
  );

  walkWithVisitor(program, visitor, code);

  if (!result) {
    throw new Error('Module analysis did not produce a result (Program:exit not called?)');
  }
  return result;
}

describe('calculateModuleComplexity', () => {
  it('should return 0 complexity for trivial code', () => {
    const { score } = calculateModuleComplexity(1, 1, 1);
    // With all ln(1)=0 inputs, MI = 171, complexity = 0
    expect(score).toBeCloseTo(0, 0);
  });

  it('should increase complexity with higher effort', () => {
    const easy = calculateModuleComplexity(100, 1, 10);
    const hard = calculateModuleComplexity(10000, 1, 10);
    expect(hard.score).toBeGreaterThan(easy.score);
  });

  it('should increase complexity with higher cyclomatic', () => {
    const simple = calculateModuleComplexity(100, 5, 10);
    const complex = calculateModuleComplexity(100, 50, 10);
    expect(complex.score).toBeGreaterThan(simple.score);
  });

  it('should increase complexity with more LOC', () => {
    const small = calculateModuleComplexity(100, 5, 10);
    const large = calculateModuleComplexity(100, 5, 1000);
    expect(large.score).toBeGreaterThan(small.score);
  });

  it('should clamp score to 100 maximum', () => {
    const { score } = calculateModuleComplexity(1e30, 1e10, 1e10);
    expect(score).toBe(100);
  });
});

describe('computeMIInputs', () => {
  it('should return module-level values when no functions', () => {
    const moduleHalstead = { effort: 500 } as any;
    const inputs = computeMIInputs(0, 0, 100, moduleHalstead, 0);
    expect(inputs.avgEffort).toBe(500);
    expect(inputs.avgCyclomatic).toBe(1);
    expect(inputs.avgLOC).toBe(100);
  });

  it('should compute averages when functions exist', () => {
    const moduleHalstead = { effort: 1000 } as any;
    const inputs = computeMIInputs(4, 20, 200, moduleHalstead, 800);
    expect(inputs.avgEffort).toBe(200);
    expect(inputs.avgCyclomatic).toBe(5);
    expect(inputs.avgLOC).toBe(50);
  });
});

describe('Module analysis visitor', () => {
  it('should analyze a simple module with one function', () => {
    const code = `
function greet(name) {
  if (name) {
    return "Hello " + name;
  }
  return "Hello stranger";
}
`;
    const result = analyzeModule(code);

    expect(result.functionCount).toBe(1);
    expect(result.functions[0].name).toBe('greet');
    expect(result.functions[0].cyclomatic).toBe(2); // 1 base + 1 if
    expect(result.functions[0].cognitive).toBe(1); // 1 if
    expect(result.cyclomatic.sum).toBe(2);
    expect(result.cognitive.sum).toBe(1);
    expect(result.moduleComplexity).toBeGreaterThanOrEqual(0);
    expect(result.moduleComplexity).toBeLessThan(100);
  });

  it('should analyze module with multiple functions', () => {
    const code = `
function add(a, b) { return a + b; }
function subtract(a, b) { return a - b; }
function multiply(a, b) { return a * b; }
`;
    const result = analyzeModule(code);

    expect(result.functionCount).toBe(3);
    expect(result.functions.map((f) => f.name)).toEqual(['add', 'subtract', 'multiply']);
    // Each function has cyclomatic 1 (just base)
    expect(result.cyclomatic.sum).toBe(3);
    expect(result.cyclomatic.max).toBe(1);
    expect(result.cyclomatic.average).toBeCloseTo(1, 5);
  });

  it('should track Halstead metrics at module level', () => {
    const code = `
function calc(x, y) {
  return x + y * 2;
}
`;
    const result = analyzeModule(code);

    expect(result.halstead.n1).toBeGreaterThan(0);
    expect(result.halstead.n2).toBeGreaterThan(0);
    expect(result.halstead.volume).toBeGreaterThan(0);
    expect(result.halstead.effort).toBeGreaterThan(0);
  });

  it('should track per-function Halstead metrics', () => {
    const code = `
function foo() { return 1 + 2; }
function bar() { return 3 * 4 * 5; }
`;
    const result = analyzeModule(code);

    expect(result.functions[0].halstead.volume).toBeGreaterThan(0);
    expect(result.functions[1].halstead.volume).toBeGreaterThan(0);
    // bar has more operators, so likely higher effort
    expect(result.functions[1].halstead.N1).toBeGreaterThanOrEqual(result.functions[0].halstead.N1);
  });

  it('should compute MI that makes sense', () => {
    // Simple code → high MI
    const simple = analyzeModule(`function id(x) { return x; }`);
    // Complex code → lower MI
    const complex = analyzeModule(`
function process(data) {
  if (data.type === 'a') {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].valid) {
        switch (data.items[i].category) {
          case 'x': return processX(data.items[i]);
          case 'y': return processY(data.items[i]);
          case 'z': return processZ(data.items[i]);
          default: return null;
        }
      }
    }
  } else if (data.type === 'b') {
    while (data.hasNext()) {
      if (data.current() && data.current().active) {
        try {
          return transform(data.current());
        } catch (e) {
          return fallback(e);
        }
      }
    }
  }
  return null;
}
`);

    expect(simple.moduleComplexity).toBeLessThan(complex.moduleComplexity);
  });

  it('should count functions above threshold', () => {
    const code = `
function simple() { return 1; }
function medium(x) {
  if (x > 0) {
    if (x > 10) {
      for (let i = 0; i < x; i++) {
        if (i % 2 === 0) {
          while (i > 0) {
            if (i === 5) break;
            switch(i) {
              case 1: break;
              case 2: break;
              case 3: break;
              case 4: break;
            }
          }
        }
      }
    }
  }
  return x;
}
`;
    const result = analyzeModule(code, 'test.js');

    // simple has cyclomatic 1, medium has cyclomatic > 10
    expect(result.cyclomatic.countAboveThreshold).toBe(1); // medium is above 10
  });

  it('should include complexityDecomposition in result', () => {
    const code = `
function foo(x) {
  if (x) return x + 1;
  return 0;
}
`;
    const result = analyzeModule(code);

    expect(result.complexityDecomposition).toBeDefined();
    expect(result.complexityDecomposition.effortTerm).toBeGreaterThanOrEqual(0);
    expect(result.complexityDecomposition.cyclomaticTerm).toBeGreaterThanOrEqual(0);
    expect(result.complexityDecomposition.locTerm).toBeGreaterThanOrEqual(0);
    expect(['effort', 'cyclomatic', 'loc']).toContain(
      result.complexityDecomposition.mainContributor
    );
  });

  it('should handle empty module', () => {
    const result = analyzeModule('// empty module\nvar x = 1;\n');

    expect(result.functionCount).toBe(0);
    expect(result.cyclomatic.sum).toBe(0);
    expect(result.cognitive.sum).toBe(0);
    expect(result.moduleComplexity).toBeLessThan(100);
  });

  it('should compute totalLOC from program', () => {
    const code = 'function a() {}\nfunction b() {}\nfunction c() {}\n';
    const result = analyzeModule(code);

    expect(result.totalLOC).toBeGreaterThan(0);
  });

  it('should forward per-function results to callback', () => {
    const code = `
function foo() { if (true) {} }
function bar() { for (;;) {} }
`;
    const { program } = parseAndPrepareAst(code, 'test.js');
    const context = createMockContext(program);
    const functionCalls: Array<{ cyclomatic: number; cognitive: number }> = [];
    let moduleResult: ModuleAnalysisResult | undefined;

    const visitor = createModuleAnalysisVisitor(
      context,
      (r) => {
        moduleResult = r;
      },
      (result) => {
        functionCalls.push({ cyclomatic: result.cyclomatic, cognitive: result.cognitive });
      },
      {}
    );

    walkWithVisitor(program, visitor, code);

    expect(functionCalls.length).toBe(2);
    expect(moduleResult).toBeDefined();
    expect(moduleResult!.functionCount).toBe(2);
  });
});
