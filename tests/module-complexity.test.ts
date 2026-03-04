import { describe, it, expect } from 'vitest';
import { parseAndPrepareAst, walkWithVisitor, createMockContext } from './utils/test-helpers.js';
import type { ESTreeNode, VisitorWithHooks } from '#src/types.js';
import { createModuleAnalysisVisitor } from '#src/module/visitor.js';
import type { ModuleAnalysisResult } from '#src/module/visitor.js';
import type { CombinedComplexityResult } from '#src/combined-visitor.js';
import { parseModuleOptions } from '#src/rules/shared.js';
import { complexity } from '#src/rules/complexity.js';

function analyzeWithModuleRule(
  code: string,
  moduleOptions: Record<string, unknown>,
  filename = 'test.js'
): {
  moduleResult: ModuleAnalysisResult;
  functionResults: Array<{ name: string; cyclomatic: number; cognitive: number }>;
  reports: string[];
} {
  const { program } = parseAndPrepareAst(code, filename);
  const context = createMockContext(program);

  const reports: string[] = [];
  (context as any).report = ({ message }: { message: string }) => {
    reports.push(message);
  };
  (context as any).options = [{ ...moduleOptions, cyclomatic: 20, cognitive: 15, minLines: 0 }];

  let moduleResult: ModuleAnalysisResult | undefined;
  const functionResults: Array<{ name: string; cyclomatic: number; cognitive: number }> = [];

  const visitor = createModuleAnalysisVisitor(
    context,
    (r) => {
      moduleResult = r;
    },
    (result: CombinedComplexityResult, node: ESTreeNode) => {
      const name = (node as any).id?.name ?? '<anonymous>';
      functionResults.push({
        name,
        cyclomatic: result.cyclomatic,
        cognitive: result.cognitive,
      });
    }
  );

  walkWithVisitor(program, visitor, code);

  if (!moduleResult) {
    throw new Error('Module analysis did not produce a result');
  }

  return { moduleResult, functionResults, reports };
}

describe('parseModuleOptions', () => {
  it('should return disabled when moduleComplexity is absent', () => {
    const opts = parseModuleOptions();
    expect(opts.enabled).toBe(false);
  });

  it('should return disabled when moduleComplexity is undefined', () => {
    const opts = parseModuleOptions({});
    expect(opts.enabled).toBe(false);
  });

  it('should return enabled with defaults when moduleComplexity is 0', () => {
    const opts = parseModuleOptions({ moduleComplexity: 0 });
    expect(opts.enabled).toBe(true);
    expect(opts.moduleComplexity).toBe(0);
    expect(opts.maxCyclomaticSum).toBe(0);
    expect(opts.maxCognitiveSum).toBe(0);
  });

  it('should use moduleComplexity value', () => {
    const opts = parseModuleOptions({ moduleComplexity: 30 });
    expect(opts.enabled).toBe(true);
    expect(opts.moduleComplexity).toBe(30);
  });

  it('should use provided values', () => {
    const opts = parseModuleOptions({
      moduleComplexity: 30,
      maxCyclomaticSum: 50,
      maxCognitiveSum: 40,
    });
    expect(opts.enabled).toBe(true);
    expect(opts.moduleComplexity).toBe(30);
    expect(opts.maxCyclomaticSum).toBe(50);
    expect(opts.maxCognitiveSum).toBe(40);
  });
});

/**
 * Run code through the actual complexity rule (createOnce + before + walk)
 * to capture the real report messages including module-level insights.
 */
function runComplexityRule(
  code: string,
  options: Record<string, unknown>,
  filename = 'test.js'
): string[] {
  const { program } = parseAndPrepareAst(code, filename);
  const context = createMockContext(program);

  const reports: string[] = [];
  (context as any).report = ({ message }: { message: string }) => {
    reports.push(message);
  };
  (context as any).options = [options];

  const visitor = (complexity as any).createOnce(context) as VisitorWithHooks;
  visitor.before?.();
  walkWithVisitor(program, visitor as any, code);

  return reports;
}

describe('Module complexity rule integration', () => {
  it('should report when cyclomatic sum exceeds threshold', () => {
    const code = `
function a(x) { if (x) { if (x > 1) { if (x > 2) {} } } return x; }
function b(x) { if (x) { if (x > 1) { if (x > 2) {} } } return x; }
function c(x) { if (x) { if (x > 1) { if (x > 2) {} } } return x; }
`;
    const { moduleResult } = analyzeWithModuleRule(code, {
      moduleComplexity: 0,
      maxCyclomaticSum: 5,
    });

    // Each function has cyclomatic 4 (1 base + 3 ifs), sum = 12
    expect(moduleResult.cyclomatic.sum).toBe(12);
    expect(moduleResult.cyclomatic.sum).toBeGreaterThan(5);
  });

  it('should not report when below thresholds', () => {
    const code = `function simple() { return 1; }`;
    const { moduleResult } = analyzeWithModuleRule(code, {
      moduleComplexity: 0,
      maxCyclomaticSum: 100,
      maxCognitiveSum: 100,
    });

    expect(moduleResult.cyclomatic.sum).toBe(1);
    expect(moduleResult.cognitive.sum).toBe(0);
  });

  it('should track function-level results alongside module', () => {
    const code = `
function foo(x) { if (x) return x; return 0; }
function bar(x, y) { return x && y ? x : y; }
`;
    const { moduleResult, functionResults } = analyzeWithModuleRule(code, { moduleComplexity: 0 });

    expect(functionResults.length).toBe(2);
    expect(moduleResult.functionCount).toBe(2);
    expect(moduleResult.halstead.volume).toBeGreaterThan(0);
  });

  it('should compute module complexity score', () => {
    const code = `
function complexFunction(data) {
  if (data.type === 'a') {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].valid) {
        switch (data.items[i].category) {
          case 'x': return 1;
          case 'y': return 2;
          default: return 0;
        }
      }
    }
  }
  return null;
}
`;
    const { moduleResult } = analyzeWithModuleRule(code, { moduleComplexity: 20 });

    expect(moduleResult.moduleComplexity).toBeGreaterThan(0);
    expect(moduleResult.moduleComplexity).toBeLessThanOrEqual(100);
  });

  it('should report cognitive sum threshold', () => {
    const code = `
function deep(x) {
  if (x) {
    if (x > 1) {
      if (x > 2) {
        if (x > 3) {
          return x;
        }
      }
    }
  }
  return 0;
}
`;
    const { moduleResult } = analyzeWithModuleRule(code, {
      moduleComplexity: 0,
      maxCognitiveSum: 5,
    });

    // Deeply nested ifs generate high cognitive complexity
    expect(moduleResult.cognitive.sum).toBeGreaterThan(5);
  });

  it('should count functions above cyclomatic threshold', () => {
    const code = `
function simple() { return 1; }
function complex(x) {
  if (x > 0) {
    if (x > 10) {
      for (let i = 0; i < x; i++) {
        if (i % 2 === 0) {
          while (i > 0) {
            if (i === 5) break;
            if (i === 6) break;
            if (i === 7) break;
            if (i === 8) break;
            if (i === 9) break;
          }
        }
      }
    }
  }
  return x;
}
`;
    const { moduleResult } = analyzeWithModuleRule(code, { moduleComplexity: 0 });

    // complex function has cyclomatic > 10 (default threshold)
    expect(moduleResult.cyclomatic.countAboveThreshold).toBe(1);
  });
});

describe('Complexity decomposition', () => {
  it('should include complexityDecomposition on the analysis result', () => {
    const code = `
function foo(x) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      if (i % 2 === 0) return i;
    }
  }
  return x;
}
`;
    const { moduleResult } = analyzeWithModuleRule(code, { moduleComplexity: 0 });

    expect(moduleResult.complexityDecomposition).toBeDefined();
    expect(moduleResult.complexityDecomposition.effortTerm).toBeGreaterThan(0);
    expect(moduleResult.complexityDecomposition.locTerm).toBeGreaterThan(0);
    expect(['effort', 'cyclomatic', 'loc']).toContain(
      moduleResult.complexityDecomposition.mainContributor
    );
  });
});

describe('Module report message format', () => {
  const complexCode = `
function processOrder(data) {
  if (data.type === 'a') {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].valid) {
        switch (data.items[i].category) {
          case 'x': return 1;
          case 'y': return 2;
          case 'z': return 3;
          default: return 0;
        }
      }
    }
  } else if (data.type === 'b') {
    while (data.hasNext()) {
      if (data.current() && data.current().active) {
        try { return transform(data.current()); }
        catch (e) { return fallback(e); }
      }
    }
  }
  return null;
}
function helper(x) {
  if (x > 0) { if (x > 10) { return x * 2; } }
  return x;
}
function simple() { return 1; }
`;

  it('should use plain-language complexity message instead of jargon', () => {
    const reports = runComplexityRule(complexCode, {
      moduleComplexity: 10,
      cyclomatic: 100,
      cognitive: 100,
      minLines: 0,
    });

    const moduleReport = reports.find((r) => r.includes('too complex'));
    expect(moduleReport).toBeDefined();
    expect(moduleReport).toContain('score:');
    expect(moduleReport).toContain('/100');
    expect(moduleReport).not.toContain('Maintainability Index');
  });

  it('should include estimated bug risk and reading time when applicable', () => {
    const reports = runComplexityRule(complexCode, {
      moduleComplexity: 10,
      cyclomatic: 100,
      cognitive: 100,
      minLines: 0,
    });

    const moduleReport = reports.find((r) => r.includes('too complex'));
    expect(moduleReport).toBeDefined();
    // Bug risk shown when >= 0.1
    expect(moduleReport).toContain('Main contributor:');
  });

  it('should use plain-language cyclomatic sum message', () => {
    const reports = runComplexityRule(complexCode, {
      moduleComplexity: 0,
      maxCyclomaticSum: 1,
      cyclomatic: 100,
      cognitive: 100,
      minLines: 0,
    });

    const moduleReport = reports.find((r) => r.includes('decision paths'));
    expect(moduleReport).toBeDefined();
    expect(moduleReport).toContain('total:');
    expect(moduleReport).toContain('maximum:');
  });

  it('should use plain-language cognitive sum message', () => {
    const reports = runComplexityRule(complexCode, {
      moduleComplexity: 0,
      maxCognitiveSum: 1,
      cyclomatic: 100,
      cognitive: 100,
      minLines: 0,
    });

    const moduleReport = reports.find((r) => r.includes('too hard to read'));
    expect(moduleReport).toBeDefined();
    expect(moduleReport).toContain('cognitive total:');
  });
});
