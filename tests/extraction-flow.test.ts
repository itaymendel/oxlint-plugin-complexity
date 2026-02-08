import { describe, it, expect, beforeAll } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ExtractionCandidate } from '#src/extraction/types.js';
import {
  analyzeExtractionOpportunities,
  formatExtractionSuggestions,
} from '#src/extraction/index.js';
import { analyzeVariableFlow } from '#src/extraction/flow-analyzer.js';
import { createExtractionSuggestion } from '#src/extraction/suggestion-generator.js';
import { loadFixture } from './utils/fixture-loader.js';
import {
  type ExtendedResult,
  calculateCognitiveWithTracking,
  analyzeFlowFromResult,
  buildCandidateForRange,
} from './utils/extraction-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('Smart Extraction Detection', () => {
  describe('Early Return Detection', () => {
    let earlyReturnResults: Map<string, ExtendedResult>;

    beforeAll(() => {
      const fixture = loadFixture(join(fixturesDir, 'js/early-returns.js'), fixturesDir);
      earlyReturnResults = calculateCognitiveWithTracking(fixture.code, 'test.js');
    });

    it('detects early returns in guard clause functions', () => {
      const result = earlyReturnResults.get('guardClauses')!;
      expect(result).toBeDefined();

      const flow = analyzeFlowFromResult(result);
      expect(flow.hasEarlyReturn).toBe(true);
    });

    it('detects early returns in functions with multiple exit points', () => {
      const result = earlyReturnResults.get('multipleExitPoints')!;
      expect(result).toBeDefined();

      const flow = analyzeFlowFromResult(result);
      expect(flow.hasEarlyReturn).toBe(true);
    });

    it('does not flag functions without return statements as having early returns', () => {
      const code = `
        function noReturns(items) {
          let count = 0;
          for (const item of items) {
            if (item.active) {
              for (const child of item.children || []) {
                if (child.valid) {
                  count++;
                }
              }
            }
          }
          console.log(count);
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('noReturns')!;
      const flow = analyzeFlowFromResult(result);

      expect(flow.hasEarlyReturn).toBe(false);
    });

    it('does not flag a single return on the last line as early return', () => {
      const code = `
        function singleReturn(a, b) {
          let result = 0;
          if (a > 0) {
            result = a + b;
          }
          return result;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('singleReturn')!;
      const flow = analyzeFlowFromResult(result);

      expect(flow.hasEarlyReturn).toBe(false);
    });

    it('shows early-return issues in formatted output', () => {
      const code = `
        function processData(items, config) {
          if (!items) return null;
          let total = 0;
          for (const item of items) {
            if (item.valid) {
              total += item.value;
            }
          }

          const factor = config.factor || 1;
          const adjusted = total * factor;
          const prefix = config.prefix || '';

          let output = '';
          for (const entry of config.entries || []) {
            if (entry.active) {
              if (entry.value > adjusted) {
                output += prefix + entry.label;
              }
            }
          }
          return output;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('processData')!;

      const suggestions = analyzeExtractionOpportunities(
        result.node,
        result.points,
        result.total,
        result.variables,
        'processData'
      );

      expect(suggestions.length).toBe(2);

      const withEarlyReturn = suggestions.find((s) =>
        s.issues.some((i) => i.type === 'early-return')
      );
      expect(withEarlyReturn).toBeDefined();

      const formatted = formatExtractionSuggestions(suggestions);
      expect(formatted).toContain('early return');
    });
  });

  describe('This Reference Detection', () => {
    it('detects this in function body', () => {
      const code = `
        function outer(items) {
          let count = 0;
          for (const item of items) {
            if (item.active) {
              if (item.value > 0) {
                this.total += item.value;
                count++;
              }
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const candidate = buildCandidateForRange(result, 2, -1);
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      expect(flow.hasThisReference).toBe(true);
    });

    it('does not flag this inside nested function expression', () => {
      const code = `
        function outer(items) {
          let count = 0;
          for (const item of items) {
            if (item.active) {
              if (item.value > 0) {
                const fn = function() { return this.x; };
                count++;
              }
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const candidate = buildCandidateForRange(result, 2, -1);
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      expect(flow.hasThisReference).toBe(false);
    });

    it('does not flag this inside arrow function', () => {
      const code = `
        function outer(items) {
          let count = 0;
          for (const item of items) {
            if (item.active) {
              if (item.value > 0) {
                const fn = () => this.x;
                count++;
              }
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const candidate = buildCandidateForRange(result, 2, -1);
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      expect(flow.hasThisReference).toBe(false);
    });

    it('reports no this references when none present', () => {
      const code = `
        function outer(items) {
          let count = 0;
          for (const item of items) {
            if (item.active) {
              if (item.value > 0) {
                count++;
              }
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const candidate = buildCandidateForRange(result, 2, -1);
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      expect(flow.hasThisReference).toBe(false);
    });

    it('emits this-reference issue with correct suggestion', () => {
      const code = `
        function outer(items) {
          let count = 0;
          for (const item of items) {
            if (item.active) {
              if (item.value > 0) {
                this.total += item.value;
                count++;
              }
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const candidate = buildCandidateForRange(result, 2, -1);
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);
      const suggestion = createExtractionSuggestion(candidate, flow);

      const thisIssue = suggestion.issues.find((i) => i.type === 'this-reference');
      expect(thisIssue).toBeDefined();
      expect(thisIssue!.description).toContain('this');

      const thisSuggestion = suggestion.suggestions.find((s) => s.includes('.call(this)'));
      expect(thisSuggestion).toBeDefined();
    });
  });
});
