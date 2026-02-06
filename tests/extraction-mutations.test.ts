import { describe, it, expect } from 'vitest';
import type { ExtractionCandidate } from '#src/extraction/types.js';
import { analyzeVariableFlow } from '#src/extraction/flow-analyzer.js';
import { calculateCognitiveWithTracking } from './utils/extraction-helpers.js';

describe('Smart Extraction Detection', () => {
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
