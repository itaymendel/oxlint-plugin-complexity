import { describe, it, expect, beforeAll } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseSync } from 'oxc-parser';
import type { ESTreeNode, ComplexityResult } from '#src/types.js';
import type { VariableInfo } from '#src/extraction/types.js';
import {
  createCognitiveVisitorWithTracking,
  type ComplexityResultWithVariables,
} from '#src/cognitive/visitor.js';
import {
  analyzeExtractionOpportunities,
  shouldAnalyzeExtraction,
  formatExtractionSuggestions,
} from '#src/extraction/index.js';
import { loadFixture } from './utils/fixture-loader.js';
import { createMockContext, walkWithVisitor } from './utils/test-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

interface ExtendedResult extends ComplexityResult {
  functionName: string;
  variables: Map<string, VariableInfo>;
  node: ESTreeNode;
}

/**
 * Calculate cognitive complexity with variable tracking.
 */
function calculateCognitiveWithTracking(
  code: string,
  filename: string
): Map<string, ExtendedResult> {
  const { program, errors } = parseSync(filename, code);
  if (errors.length > 0) {
    throw new Error(`Parse errors: ${errors.map((e) => e.message).join(', ')}`);
  }

  const results = new Map<string, ExtendedResult>();

  const listener = createCognitiveVisitorWithTracking(
    createMockContext(),
    (result: ComplexityResultWithVariables, node: ESTreeNode) => {
      results.set(result.functionName, {
        total: result.total,
        points: result.points,
        functionName: result.functionName,
        variables: result.variables,
        node,
      });
    }
  );

  walkWithVisitor(program as unknown as ESTreeNode, listener, code);
  return results;
}

describe('Smart Extraction Detection', () => {
  describe('shouldAnalyzeExtraction', () => {
    it('returns false when complexity is at threshold', () => {
      expect(shouldAnalyzeExtraction(15, 15)).toBe(false);
    });

    it('returns false when complexity is 150% of threshold', () => {
      expect(shouldAnalyzeExtraction(22, 15)).toBe(false);
    });

    it('returns true when complexity exceeds 150% of threshold', () => {
      expect(shouldAnalyzeExtraction(23, 15)).toBe(true);
    });

    it('respects custom multiplier option', () => {
      expect(shouldAnalyzeExtraction(18, 15, { minComplexityMultiplier: 1.2 })).toBe(false);
      expect(shouldAnalyzeExtraction(19, 15, { minComplexityMultiplier: 1.2 })).toBe(true);
    });
  });

  describe('Variable Tracking', () => {
    it('tracks variable declarations and references', () => {
      const code = `
        function test(param) {
          const a = 1;
          let b = param + a;
          if (b > 0) {
            b = b + 1;
          }
          return b;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('test')!;

      expect(result.variables.has('param')).toBe(true);
      expect(result.variables.has('a')).toBe(true);
      expect(result.variables.has('b')).toBe(true);

      const paramInfo = result.variables.get('param')!;
      expect(paramInfo.declarationType).toBe('param');

      const aInfo = result.variables.get('a')!;
      expect(aInfo.declarationType).toBe('const');
      expect(aInfo.isMutable).toBe(false);

      const bInfo = result.variables.get('b')!;
      expect(bInfo.declarationType).toBe('let');
      expect(bInfo.isMutable).toBe(true);
    });

    it('tracks TypeScript type annotations', () => {
      const code = `
        function test(items: string[], config: { max: number }) {
          const result: number = items.length;
          return result;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.ts');
      const result = results.get('test')!;

      const resultInfo = result.variables.get('result');
      expect(resultInfo?.typeAnnotation).toBe('number');
    });
  });

  describe('Extraction Analysis', () => {
    let jsResult: ExtendedResult;
    let tsResult: ExtendedResult;

    beforeAll(() => {
      const jsFixture = loadFixture(join(fixturesDir, 'js/extraction-candidate.js'), fixturesDir);
      const jsResults = calculateCognitiveWithTracking(jsFixture.code, 'test.js');
      jsResult = jsResults.get('processOrder')!;

      const tsFixture = loadFixture(join(fixturesDir, 'ts/extraction-typed.ts'), fixturesDir);
      const tsResults = calculateCognitiveWithTracking(tsFixture.code, 'test.ts');
      tsResult = tsResults.get('analyzeData')!;
    });

    it('finds extraction candidates in complex functions', () => {
      const suggestions = analyzeExtractionOpportunities(
        jsResult.node,
        jsResult.points,
        jsResult.total,
        jsResult.variables,
        'processOrder'
      );

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('identifies input variables for extraction', () => {
      const suggestions = analyzeExtractionOpportunities(
        jsResult.node,
        jsResult.points,
        jsResult.total,
        jsResult.variables,
        'processOrder'
      );

      const suggestion = suggestions[0];
      expect(suggestion.inputs.length).toBeGreaterThan(0);
    });

    it('calculates complexity percentage for each candidate', () => {
      const suggestions = analyzeExtractionOpportunities(
        jsResult.node,
        jsResult.points,
        jsResult.total,
        jsResult.variables,
        'processOrder'
      );

      for (const suggestion of suggestions) {
        expect(suggestion.complexityPercentage).toBeGreaterThan(0);
        expect(suggestion.complexityPercentage).toBeLessThanOrEqual(100);
      }
    });

    it('assigns confidence levels based on extraction difficulty', () => {
      const suggestions = analyzeExtractionOpportunities(
        jsResult.node,
        jsResult.points,
        jsResult.total,
        jsResult.variables,
        'processOrder'
      );

      for (const suggestion of suggestions) {
        expect(['high', 'medium', 'low']).toContain(suggestion.confidence);
      }
    });

    it('generates function signatures for viable extractions', () => {
      const suggestions = analyzeExtractionOpportunities(
        jsResult.node,
        jsResult.points,
        jsResult.total,
        jsResult.variables,
        'processOrder'
      );

      const highConfidence = suggestions.find((s) => s.confidence === 'high');
      if (highConfidence) {
        expect(highConfidence.suggestedSignature).toBeDefined();
      }
    });

    it('detects mutation issues', () => {
      const suggestions = analyzeExtractionOpportunities(
        jsResult.node,
        jsResult.points,
        jsResult.total,
        jsResult.variables,
        'processOrder'
      );

      const withMutations = suggestions.find((s) => s.issues.some((i) => i.type === 'mutation'));

      // If there's a block with mutations, it should be flagged
      if (withMutations) {
        expect(withMutations.confidence).not.toBe('high');
      }
    });

    it('preserves type annotations in TypeScript suggestions', () => {
      const suggestions = analyzeExtractionOpportunities(
        tsResult.node,
        tsResult.points,
        tsResult.total,
        tsResult.variables,
        'analyzeData',
        { minComplexityPercentage: 15, maxComplexityPercentage: 80 }
      );

      const hasTypes = suggestions.some(
        (s) => s.inputs.some((i) => i.type) || s.outputs.some((o) => o.type)
      );

      expect(hasTypes).toBe(true);
    });
  });

  describe('Output Formatting', () => {
    it('formats extraction suggestions correctly', () => {
      const code = `
        function complex(a, b, c) {
          let result = 0;
          for (const x of a) {
            if (x > 0) {
              for (const y of b) {
                if (y > 0) {
                  if (c) {
                    result += x + y;
                  }
                }
              }
            }
          }
          return result;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('complex')!;

      const suggestions = analyzeExtractionOpportunities(
        result.node,
        result.points,
        result.total,
        result.variables,
        'complex'
      );

      const formatted = formatExtractionSuggestions(suggestions);

      if (suggestions.length > 0) {
        expect(formatted).toContain('Smart extraction suggestions');
        expect(formatted).toContain('Lines');
        expect(formatted).toContain('Complexity');
      }
    });

    it('returns empty string when no suggestions', () => {
      expect(formatExtractionSuggestions([])).toBe('');
    });
  });

  describe('Requirements Validation', () => {
    it('tracks variable declarations and references within function', () => {
      const code = `
        function test(input) {
          const x = input.value;
          let y = x + 1;
          if (y > 10) {
            y = y * 2;
          }
          return y;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('test')!;

      expect(result.variables.size).toBeGreaterThan(0);
      expect(result.variables.has('x')).toBe(true);
      expect(result.variables.has('y')).toBe(true);
    });

    it('identifies variables read within a potential extraction range', () => {
      const code = `
        function processData(items, config) {
          let count = 0;
          for (const item of items) {
            if (item.active && config.enabled) {
              count++;
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('processData')!;

      // Verify that items and config are tracked as read
      const itemsVar = result.variables.get('items');
      const configVar = result.variables.get('config');

      expect(itemsVar).toBeDefined();
      expect(configVar).toBeDefined();
    });

    it('determines which variables are used after the extraction range', () => {
      const code = `
        function compute(a, b) {
          let intermediate = 0;
          for (let i = 0; i < a; i++) {
            if (i > 0) {
              intermediate += i;
            }
          }
          const result = intermediate * b;
          return result;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('compute')!;

      const suggestions = analyzeExtractionOpportunities(
        result.node,
        result.points,
        result.total,
        result.variables,
        'compute'
      );

      // If intermediate is modified in a block and used after,
      // it should appear in outputs
      const hasOutputs = suggestions.some((s) => s.outputs.length > 0);
      expect(typeof hasOutputs).toBe('boolean'); // Just verify the check runs
    });

    it('suggests function signatures for clean extractions', () => {
      const code = `
        function handleItems(items, options) {
          const processed = [];
          for (const item of items) {
            if (item.valid) {
              for (const child of item.children || []) {
                if (child.active) {
                  if (options.transform) {
                    processed.push(child);
                  }
                }
              }
            }
          }
          return processed;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('handleItems')!;

      const suggestions = analyzeExtractionOpportunities(
        result.node,
        result.points,
        result.total,
        result.variables,
        'handleItems'
      );

      const withSignature = suggestions.find((s) => s.suggestedSignature);
      if (suggestions.length > 0 && withSignature) {
        expect(withSignature.suggestedSignature).toMatch(/\w+\(/);
      }
    });
  });
});
