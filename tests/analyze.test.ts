import { describe, it, expect } from 'vitest';
import { analyzeModule } from '#src/analyze.js';

describe('analyzeModule', () => {
  it('should analyze a simple module', () => {
    const code = `
function add(a, b) {
  return a + b;
}
`;
    const result = analyzeModule(code);

    expect(result.functionCount).toBe(1);
    expect(result.functions[0].name).toBe('add');
    expect(result.functions[0].cyclomatic).toBe(1);
    expect(result.functions[0].cognitive).toBe(0);
    expect(result.halstead.volume).toBeGreaterThan(0);
    expect(result.moduleComplexity).toBeGreaterThanOrEqual(0);
    expect(result.moduleComplexity).toBeLessThan(100);
  });

  it('should analyze TypeScript code', () => {
    const code = `
interface Config {
  threshold: number;
}

function validate(config: Config): boolean {
  if (config.threshold < 0) {
    throw new Error("Invalid threshold");
  }
  return config.threshold > 0;
}
`;
    const result = analyzeModule(code, 'module.ts');

    expect(result.functionCount).toBe(1);
    expect(result.functions[0].name).toBe('validate');
    expect(result.functions[0].cyclomatic).toBe(2); // 1 base + 1 if
  });

  it('should throw on parse errors', () => {
    expect(() => analyzeModule('function { invalid', 'test.js')).toThrow('Parse errors');
  });

  it('should handle empty module', () => {
    const result = analyzeModule('// nothing here\nconst x = 1;\n');

    expect(result.functionCount).toBe(0);
    expect(result.cyclomatic.sum).toBe(0);
    expect(result.cognitive.sum).toBe(0);
  });

  it('should handle multiple functions', () => {
    const code = `
function foo() { return 1; }
function bar(x) {
  if (x > 0) return x;
  return -x;
}
function baz(a, b) {
  return a && b ? a + b : 0;
}
`;
    const result = analyzeModule(code);

    expect(result.functionCount).toBe(3);
    expect(result.functions.map((f) => f.name)).toEqual(['foo', 'bar', 'baz']);
    expect(result.cyclomatic.sum).toBeGreaterThan(3); // each has at least 1
    expect(result.halstead.n1).toBeGreaterThan(0);
    expect(result.halstead.n2).toBeGreaterThan(0);
  });

  it('should provide per-function Halstead metrics', () => {
    const code = `
function simple() { return 1; }
function complex(x, y, z) {
  if (x > 0 && y < 10) {
    for (let i = 0; i < z; i++) {
      if (i % 2 === 0) {
        console.log(i);
      }
    }
  }
  return x + y + z;
}
`;
    const result = analyzeModule(code);

    expect(result.functions[0].halstead.volume).toBeGreaterThan(0);
    expect(result.functions[1].halstead.volume).toBeGreaterThan(
      result.functions[0].halstead.volume
    );
    expect(result.functions[1].halstead.effort).toBeGreaterThan(
      result.functions[0].halstead.effort
    );
  });

  it('should compute aggregate complexity', () => {
    const code = `
function a(x) { if (x) { if (x > 1) {} } return x; }
function b(x) { if (x) {} return x; }
function c() { return 1; }
`;
    const result = analyzeModule(code, 'test.js', { cyclomaticThreshold: 2 });

    expect(result.cyclomatic.max).toBe(3); // a has 1+2=3
    expect(result.cyclomatic.average).toBeCloseTo(result.cyclomatic.sum / 3);
    // a has cyclomatic 3, above threshold 2
    expect(result.cyclomatic.countAboveThreshold).toBe(1);
  });

  it('should compute MI that distinguishes simple vs complex', () => {
    const simple = analyzeModule('function id(x) { return x; }');
    const complex = analyzeModule(`
function process(data) {
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
      try {
        return transform(data.current());
      } catch (e) {
        return fallback(e);
      }
    }
  }
  return null;
}
`);

    expect(simple.moduleComplexity).toBeLessThan(complex.moduleComplexity);
  });

  it('should accept custom options', () => {
    const code = `
function a(x) { if (x > 5) return true; return false; }
function b(x) { return x; }
`;
    const result = analyzeModule(code, 'test.js', { cyclomaticThreshold: 1 });

    // Both functions have cyclomatic >= 1
    expect(result.cyclomatic.countAboveThreshold).toBe(1); // a has 2, b has 1; only a is > 1
  });

  it('should track LOC information', () => {
    const code = `function foo() {\n  return 1;\n}\n`;
    const result = analyzeModule(code);

    expect(result.totalLOC).toBeGreaterThan(0);
    expect(result.functions[0].loc).toBeGreaterThan(0);
    expect(result.functions[0].lineStart).toBeGreaterThan(0);
    expect(result.functions[0].lineEnd).toBeGreaterThanOrEqual(result.functions[0].lineStart);
  });

  it('should export result matching ModuleAnalysisResult interface', () => {
    const result = analyzeModule('function f() {}');

    // Verify all expected fields exist
    expect(result).toHaveProperty('functions');
    expect(result).toHaveProperty('halstead');
    expect(result).toHaveProperty('cyclomatic');
    expect(result).toHaveProperty('cognitive');
    expect(result).toHaveProperty('moduleComplexity');
    expect(result).toHaveProperty('totalLOC');
    expect(result).toHaveProperty('functionCount');

    // Verify Halstead fields
    expect(result.halstead).toHaveProperty('n1');
    expect(result.halstead).toHaveProperty('n2');
    expect(result.halstead).toHaveProperty('volume');
    expect(result.halstead).toHaveProperty('difficulty');
    expect(result.halstead).toHaveProperty('effort');
    expect(result.halstead).toHaveProperty('bugs');
    expect(result.halstead).toHaveProperty('time');
  });
});
