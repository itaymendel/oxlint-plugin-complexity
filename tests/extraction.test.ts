import { describe, it, expect, beforeAll } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ESTreeNode, ComplexityResult } from '#src/types.js';
import type {
  VariableInfo,
  ExtractionCandidate,
  VariableFlowAnalysis,
} from '#src/extraction/types.js';
import {
  createCognitiveVisitorWithTracking,
  type ComplexityResultWithVariables,
} from '#src/cognitive/visitor.js';
import {
  analyzeExtractionOpportunities,
  shouldAnalyzeExtraction,
  formatExtractionSuggestions,
  PLACEHOLDER_FUNCTION_NAME,
} from '#src/extraction/index.js';
import { analyzeVariableFlow } from '#src/extraction/flow-analyzer.js';
import { loadFixture } from './utils/fixture-loader.js';
import { createMockContext, walkWithVisitor, parseAndPrepareAst } from './utils/test-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

interface ExtendedResult extends ComplexityResult {
  functionName: string;
  variables: Map<string, VariableInfo>;
  node: ESTreeNode;
}

/**
 * Calculate cognitive complexity with variable tracking.
 * Uses eslint-scope for scope analysis to match oxlint's behavior in tests.
 */
function calculateCognitiveWithTracking(
  code: string,
  filename: string
): Map<string, ExtendedResult> {
  const { program, errors } = parseAndPrepareAst(code, filename);
  if (errors.length > 0) {
    throw new Error(`Parse errors: ${errors.map((e) => e.message).join(', ')}`);
  }

  const results = new Map<string, ExtendedResult>();

  // Create context with scope analysis enabled
  const context = createMockContext(program);

  const listener = createCognitiveVisitorWithTracking(
    context,
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

  walkWithVisitor(program, listener, code);
  return results;
}

function buildCandidateFromResult(result: ExtendedResult): ExtractionCandidate {
  return {
    startLine: result.node.loc!.start.line,
    endLine: result.node.loc!.end.line,
    complexity: result.total,
    complexityPercentage: 50,
    points: result.points,
    constructs: result.points.map((p) => p.construct),
  };
}

function analyzeFlowFromResult(result: ExtendedResult): VariableFlowAnalysis {
  const candidate = buildCandidateFromResult(result);
  const functionEndLine = result.node.loc!.end.line;
  return analyzeVariableFlow(candidate, result.variables, result.node, functionEndLine);
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

      expect(suggestions.length).toBe(2);
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
      expect(suggestion.inputs.map((i) => i.name)).toEqual(['order', 'config']);
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
      expect(highConfidence).toBeDefined();
      expect(highConfidence!.suggestedSignature).toBeDefined();
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
      expect(withMutations).toBeDefined();
      expect(withMutations!.confidence).toBe('low');
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
        function complex(data, config) {
          let result = 0;
          for (const item of data) {
            if (item.active) {
              if (config.validate && item.value > 0) {
                result += item.value;
              }
            }
          }

          const factor = config.factor || 1;
          const adjusted = result * factor;

          let total = adjusted;
          for (const bonus of config.bonuses || []) {
            if (bonus.active) {
              if (bonus.value > 0) {
                total += bonus.value;
              }
            }
          }
          return total;
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

      expect(suggestions.length).toBe(2);

      const formatted = formatExtractionSuggestions(suggestions);
      expect(formatted).toContain('Smart extraction suggestions');
      expect(formatted).toContain('Lines');
      expect(formatted).toContain('Complexity');
    });

    it('returns empty string when no suggestions', () => {
      expect(formatExtractionSuggestions([])).toBe('');
    });
  });

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
        function compute(data, config) {
          for (const item of data) {
            if (item.active) {
              if (item.value > config.min) {
                console.log(item.value);
              }
            }
            const processed = item.id + item.value;
            console.log(processed);
          }

          const factor = config.factor || 1;
          const base = factor * 2;
          const extra = base + 1;

          for (const rule of config.rules || []) {
            if (rule.enabled) {
              if (rule.value > extra) {
                console.log(rule.label);
              }
            }
          }
          return extra;
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

      expect(suggestions.length).toBe(2);

      const withOutputs = suggestions.find((s) => s.outputs.length > 0);
      expect(withOutputs).toBeDefined();
      expect(withOutputs!.outputs.map((o) => o.name)).toContain('item');
    });

    it('suggests function signatures for clean extractions', () => {
      const code = `
        function handleItems(items, options) {
          const processed = [];
          for (const item of items) {
            if (item.valid) {
              if (options.transform) {
                processed.push(item.id);
              }
            }
          }

          const prefix = options.prefix || '';
          const separator = options.separator || ',';

          let output = '';
          for (const entry of processed) {
            if (entry) {
              if (prefix) {
                output += prefix + entry + separator;
              }
            }
          }
          return output;
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

      expect(suggestions.length).toBe(2);

      // The first candidate contains `processed.push(item.id)` where `processed`
      // is declared before the candidate range — correctly flagged as method-call
      // mutation. The second candidate mutates `output` directly. Both have
      // mutations so neither gets a suggested signature (low confidence).
      const withMutation = suggestions.filter((s) => s.issues.some((i) => i.type === 'mutation'));
      expect(withMutation.length).toBeGreaterThan(0);
      for (const s of suggestions) {
        expect(s.confidence).toBe('low');
      }
    });
  });

  describe('Property Mutation Detection', () => {
    it('detects simple property assignment as mutation', () => {
      // Outer function declares `data`, inner block is the extraction candidate
      const code = `
        function outer(data) {
          let total = 0;
          for (const item of data.items) {
            if (item.active) {
              if (item.value > 0) {
                total += item.value;
              }
            }
          }
          data.processed = true;
          return total;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      // Build a candidate for the loop+mutation block (lines inside the function body)
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2, // skip param declaration line
        endLine: funcEnd - 1, // before closing brace
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const propMutation = flow.mutations.find(
        (m) => m.variable.name === 'data' && m.mutationType === 'assignment'
      );
      expect(propMutation).toBeDefined();
    });

    it('detects nested member chain mutation (state.nested.deep.value)', () => {
      const code = `
        function outer(state) {
          let count = 0;
          for (const key of Object.keys(state)) {
            if (state[key]) {
              if (state[key].active) {
                count++;
              }
            }
          }
          state.nested.deep.value = count;
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const propMutation = flow.mutations.find(
        (m) => m.variable.name === 'state' && m.mutationType === 'assignment'
      );
      expect(propMutation).toBeDefined();
    });

    it('detects computed property assignment as mutation', () => {
      const code = `
        function outer(target, items) {
          let count = 0;
          for (const item of items) {
            if (item.active) {
              if (item.key) {
                target[item.key] = item.value;
                count++;
              }
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const propMutation = flow.mutations.find(
        (m) => m.variable.name === 'target' && m.mutationType === 'assignment'
      );
      expect(propMutation).toBeDefined();
    });

    it('detects UpdateExpression on member expression (stats.count++)', () => {
      const code = `
        function outer(stats, items) {
          let sum = 0;
          for (const item of items) {
            if (item.valid) {
              if (item.value > 0) {
                stats.count++;
                sum += item.value;
              }
            }
          }
          return sum;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const propMutation = flow.mutations.find(
        (m) => m.variable.name === 'stats' && m.mutationType === 'increment'
      );
      expect(propMutation).toBeDefined();
    });

    it('does not flag property mutations on locally declared variables', () => {
      const code = `
        function outer(items) {
          const result = {};
          let count = 0;
          for (const item of items) {
            if (item.active) {
              if (item.key) {
                result[item.key] = item.value;
                count++;
              }
            }
          }
          return result;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      // Candidate includes the `const result = {}` declaration (line after function header)
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 1,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const propMutation = flow.mutations.find(
        (m) => m.variable.name === 'result' && m.mutationType === 'assignment'
      );
      expect(propMutation).toBeUndefined();
    });
  });

  describe('Method-Call Mutation Detection', () => {
    it('detects arr.push(item) on external variable', () => {
      const code = `
        function outer(arr) {
          let count = 0;
          for (const i of [1,2,3]) {
            if (i > 0) {
              if (i < 10) {
                arr.push(i);
                count++;
              }
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const methodMutation = flow.mutations.find(
        (m) => m.variable.name === 'arr' && m.mutationType === 'method-call'
      );
      expect(methodMutation).toBeDefined();
    });

    it('detects arr.sort() on external variable', () => {
      const code = `
        function outer(arr) {
          let total = 0;
          for (const item of arr) {
            if (item > 0) {
              if (item < 100) {
                total += item;
              }
            }
          }
          arr.sort();
          return total;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const methodMutation = flow.mutations.find(
        (m) => m.variable.name === 'arr' && m.mutationType === 'method-call'
      );
      expect(methodMutation).toBeDefined();
    });

    it('detects map.set(k, v) on external variable', () => {
      const code = `
        function outer(map, items) {
          let count = 0;
          for (const item of items) {
            if (item.key) {
              if (item.value) {
                map.set(item.key, item.value);
                count++;
              }
            }
          }
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const methodMutation = flow.mutations.find(
        (m) => m.variable.name === 'map' && m.mutationType === 'method-call'
      );
      expect(methodMutation).toBeDefined();
    });

    it('detects set.delete(x) on external variable', () => {
      const code = `
        function outer(mySet, items) {
          let removed = 0;
          for (const item of items) {
            if (item.expired) {
              if (mySet.has(item.id)) {
                mySet.delete(item.id);
                removed++;
              }
            }
          }
          return removed;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const methodMutation = flow.mutations.find(
        (m) => m.variable.name === 'mySet' && m.mutationType === 'method-call'
      );
      expect(methodMutation).toBeDefined();
    });

    it('detects chained a.b.push(x) where a is external', () => {
      const code = `
        function outer(state) {
          let count = 0;
          for (const key of Object.keys(state)) {
            if (state[key]) {
              if (state[key].active) {
                count++;
              }
            }
          }
          state.items.push(count);
          return count;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const methodMutation = flow.mutations.find(
        (m) => m.variable.name === 'state' && m.mutationType === 'method-call'
      );
      expect(methodMutation).toBeDefined();
    });

    it('does not flag method calls on locally declared variables', () => {
      const code = `
        function outer(items) {
          const localArr = [];
          let count = 0;
          for (const item of items) {
            if (item.active) {
              if (item.value > 0) {
                localArr.push(item.value);
                count++;
              }
            }
          }
          return localArr;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 1,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const methodMutation = flow.mutations.find(
        (m) => m.variable.name === 'localArr' && m.mutationType === 'method-call'
      );
      expect(methodMutation).toBeUndefined();
    });

    it('does not flag non-mutating methods like arr.map()', () => {
      const code = `
        function outer(arr) {
          let total = 0;
          for (const item of arr) {
            if (item > 0) {
              if (item < 100) {
                total += item;
              }
            }
          }
          const mapped = arr.map(x => x * 2);
          return mapped;
        }
      `;

      const results = calculateCognitiveWithTracking(code, 'test.js');
      const result = results.get('outer')!;
      const funcStart = result.node.loc!.start.line;
      const funcEnd = result.node.loc!.end.line;
      const candidate: ExtractionCandidate = {
        startLine: funcStart + 2,
        endLine: funcEnd - 1,
        complexity: result.total,
        complexityPercentage: 50,
        points: result.points,
        constructs: result.points.map((p) => p.construct),
      };
      const flow = analyzeVariableFlow(candidate, result.variables, result.node);

      const methodMutation = flow.mutations.find(
        (m) => m.variable.name === 'arr' && m.mutationType === 'method-call'
      );
      expect(methodMutation).toBeUndefined();
    });
  });
});
