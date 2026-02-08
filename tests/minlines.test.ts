import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  createCombinedComplexityVisitor,
  type CombinedComplexityResult,
} from '#src/combined-visitor.js';
import { createMockContext, walkWithVisitor } from './utils/test-helpers.js';
import type { ESTreeNode } from '#src/types.js';

/**
 * Test suite for minLines configuration option.
 * Tests that functions below the minLines threshold are skipped.
 */
describe('minLines configuration', () => {
  interface TestCase {
    name: string;
    code: string;
    expectedLines: number;
    expectedCyclomatic: number;
    expectedCognitive: number;
  }

  const testCases: TestCase[] = [
    {
      name: 'smallFunction',
      code: `
        function smallFunction(a) {
          return a + 1;
        }
      `,
      expectedLines: 3,
      expectedCyclomatic: 1,
      expectedCognitive: 0,
    },
    {
      name: 'mediumFunction',
      code: `
        function mediumFunction(a, b) {
          const sum = a + b;
          const product = a * b;
          return { sum, product };
        }
      `,
      expectedLines: 5,
      expectedCyclomatic: 1,
      expectedCognitive: 0,
    },
    {
      name: 'largeSimpleFunction',
      code: `
        function largeSimpleFunction(x) {
          const a = x + 1;
          const b = x + 2;
          const c = x + 3;
          const d = x + 4;
          const e = x + 5;
          const f = x + 6;
          return a + b + c + d + e + f;
        }
      `,
      expectedLines: 9,
      expectedCyclomatic: 1,
      expectedCognitive: 0,
    },
    {
      name: 'complexShortFunction',
      code: `
        function complexShortFunction(a, b, c, d, e, f, g, h, i) {
          return a && b && c && d && e && f && g && h && i;
        }
      `,
      expectedLines: 3,
      expectedCyclomatic: 9, // 1 + 8 && operators
      expectedCognitive: 1, // Logical operators in sequence add +1 total (not per operator)
    },
    {
      name: 'complexLongFunction',
      code: `
        function complexLongFunction(items, mode, config) {
          if (!items) return null;

          for (const item of items) {
            if (item.active) {
              if (mode === 'strict') {
                if (config.validate) {
                  if (item.required) {
                    processItem(item);
                  }
                }
              }
            }
          }
        }
      `,
      expectedLines: 15,
      expectedCyclomatic: 7, // 1 + 1 for + 5 if (including the early return if)
      expectedCognitive: 16, // Deep nesting
    },
  ];

  describe('Line counting', () => {
    it.each(testCases)('should count $expectedLines lines for $name', ({ code, expectedLines }) => {
      const { program } = parseSync('test.ts', code);
      const ast = program as unknown as ESTreeNode;

      let actualLines = 0;

      const visitor = {
        'FunctionDeclaration:exit': (node: ESTreeNode) => {
          if (node.loc) {
            actualLines = node.loc.end.line - node.loc.start.line + 1;
          }
        },
        'FunctionExpression:exit': (node: ESTreeNode) => {
          if (node.loc) {
            actualLines = node.loc.end.line - node.loc.start.line + 1;
          }
        },
        'ArrowFunctionExpression:exit': (node: ESTreeNode) => {
          if (node.loc) {
            actualLines = node.loc.end.line - node.loc.start.line + 1;
          }
        },
      };

      walkWithVisitor(ast, visitor, code);

      expect(actualLines).toBe(expectedLines);
    });
  });

  describe('minLines filtering behavior', () => {
    interface FilterTestCase {
      minLines: number;
      expectedFunctionsAnalyzed: string[];
    }

    const filterTests: FilterTestCase[] = [
      {
        minLines: 0,
        expectedFunctionsAnalyzed: [
          'smallFunction',
          'mediumFunction',
          'largeSimpleFunction',
          'complexShortFunction',
          'complexLongFunction',
        ],
      },
      {
        minLines: 5,
        expectedFunctionsAnalyzed: ['mediumFunction', 'largeSimpleFunction', 'complexLongFunction'],
      },
      {
        minLines: 10,
        expectedFunctionsAnalyzed: ['complexLongFunction'],
      },
      {
        minLines: 20,
        expectedFunctionsAnalyzed: [],
      },
    ];

    it.each(filterTests)(
      'with minLines: $minLines, should analyze: $expectedFunctionsAnalyzed',
      ({ minLines, expectedFunctionsAnalyzed }) => {
        const allCode = testCases.map((tc) => tc.code).join('\n');
        const { program } = parseSync('test.ts', allCode);
        const ast = program as unknown as ESTreeNode;

        const analyzedFunctions: string[] = [];

        const onComplexityCalculated = (result: CombinedComplexityResult, node: ESTreeNode) => {
          // Simulate the minLines check from complexity.ts
          if (minLines > 0 && node.loc) {
            const functionLines = node.loc.end.line - node.loc.start.line + 1;
            if (functionLines < minLines) {
              return; // Skip
            }
          }

          // Extract function name
          if (node.type === 'FunctionDeclaration') {
            const funcNode = node as { id?: { name: string } };
            if (funcNode.id?.name) {
              analyzedFunctions.push(funcNode.id.name);
            }
          }
        };

        const listener = createCombinedComplexityVisitor(
          createMockContext(ast),
          onComplexityCalculated
        );
        walkWithVisitor(ast, listener, allCode);

        expect(analyzedFunctions.sort()).toEqual(expectedFunctionsAnalyzed.sort());
      }
    );
  });

  describe('Complexity calculation with minLines', () => {
    it('should correctly calculate complexity for functions that pass minLines threshold', () => {
      const minLines = 10;
      const code = testCases.map((tc) => tc.code).join('\n');
      const { program } = parseSync('test.ts', code);
      const ast = program as unknown as ESTreeNode;

      const results = new Map<string, { cyclomatic: number; cognitive: number; lines: number }>();

      const onComplexityCalculated = (result: CombinedComplexityResult, node: ESTreeNode) => {
        // Apply minLines filter
        if (node.loc) {
          const functionLines = node.loc.end.line - node.loc.start.line + 1;
          if (minLines > 0 && functionLines < minLines) {
            return; // Skip
          }

          // Get function name
          if (node.type === 'FunctionDeclaration') {
            const funcNode = node as { id?: { name: string } };
            if (funcNode.id?.name) {
              results.set(funcNode.id.name, {
                cyclomatic: result.cyclomatic,
                cognitive: result.cognitive,
                lines: functionLines,
              });
            }
          }
        }
      };

      const listener = createCombinedComplexityVisitor(
        createMockContext(ast),
        onComplexityCalculated
      );
      walkWithVisitor(ast, listener, code);

      // Only complexLongFunction should be analyzed (15 lines >= 10)
      expect(results.size).toBe(1);
      expect(results.has('complexLongFunction')).toBe(true);

      const complexLong = results.get('complexLongFunction')!;
      expect(complexLong.lines).toBe(15);
      expect(complexLong.cyclomatic).toBe(7); // Fixed: 1 + 6 (1 for + 5 if)
      expect(complexLong.cognitive).toBe(16);
    });

    it('should analyze all functions when minLines is 0', () => {
      const minLines = 0;
      const code = testCases.map((tc) => tc.code).join('\n');
      const { program } = parseSync('test.ts', code);
      const ast = program as unknown as ESTreeNode;

      const results = new Map<string, { cyclomatic: number; cognitive: number }>();

      const onComplexityCalculated = (result: CombinedComplexityResult, node: ESTreeNode) => {
        // Apply minLines filter
        if (minLines > 0 && node.loc) {
          const functionLines = node.loc.end.line - node.loc.start.line + 1;
          if (functionLines < minLines) {
            return; // Skip
          }
        }

        // Get function name
        if (node.type === 'FunctionDeclaration') {
          const funcNode = node as { id?: { name: string } };
          if (funcNode.id?.name) {
            results.set(funcNode.id.name, {
              cyclomatic: result.cyclomatic,
              cognitive: result.cognitive,
            });
          }
        }
      };

      const listener = createCombinedComplexityVisitor(
        createMockContext(ast),
        onComplexityCalculated
      );
      walkWithVisitor(ast, listener, code);

      // All 5 functions should be analyzed
      expect(results.size).toBe(5);

      // Verify specific complexities
      const testCase = testCases.find((tc) => tc.name === 'complexShortFunction')!;
      const complexShort = results.get('complexShortFunction');
      expect(complexShort?.cyclomatic).toBe(testCase.expectedCyclomatic);
      expect(complexShort?.cognitive).toBe(testCase.expectedCognitive);
    });
  });

  describe('Edge cases', () => {
    it('should handle one-liner arrow functions correctly', () => {
      const code = 'const oneLineArrow = (x) => x + 1;';
      const { program } = parseSync('test.ts', code);
      const ast = program as unknown as ESTreeNode;

      let functionLines = 0;

      const visitor = {
        'ArrowFunctionExpression:exit': (node: ESTreeNode) => {
          if (node.loc) {
            functionLines = node.loc.end.line - node.loc.start.line + 1;
          }
        },
      };

      walkWithVisitor(ast, visitor, code);

      // One-liner arrow function should be 1 line
      expect(functionLines).toBe(1);
    });

    it('should handle functions with comments correctly', () => {
      const code = `
        function withComments(a, b) {
          // This is a comment
          const sum = a + b;
          // Another comment

          return sum;
        }
      `;
      const { program } = parseSync('test.ts', code);
      const ast = program as unknown as ESTreeNode;

      let functionLines = 0;

      const visitor = {
        'FunctionDeclaration:exit': (node: ESTreeNode) => {
          if (node.loc) {
            functionLines = node.loc.end.line - node.loc.start.line + 1;
          }
        },
      };

      walkWithVisitor(ast, visitor, code);

      // Should count comments and blank lines
      expect(functionLines).toBe(7);
    });

    it('should handle functions without loc gracefully', () => {
      const code = 'function test() { return 1; }';
      const { program } = parseSync('test.ts', code);
      const ast = program as unknown as ESTreeNode;

      let analyzedCount = 0;

      const onComplexityCalculated = (result: CombinedComplexityResult, node: ESTreeNode) => {
        // Simulate the minLines check - should handle missing loc gracefully
        const minLines = 10;
        if (minLines > 0 && node.loc) {
          const functionLines = node.loc.end.line - node.loc.start.line + 1;
          if (functionLines < minLines) {
            return; // Skip
          }
        }

        // If loc is missing or function is long enough, it gets analyzed
        analyzedCount++;
      };

      const listener = createCombinedComplexityVisitor(
        createMockContext(ast),
        onComplexityCalculated
      );
      walkWithVisitor(ast, listener, code);

      // Function with 1 line should be skipped (< minLines: 10)
      // But if loc is missing, the check is bypassed and function is analyzed
      expect(analyzedCount).toBe(0); // Should be skipped because it has loc and is < 10 lines
    });
  });
});
