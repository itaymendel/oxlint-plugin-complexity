import { parseSync } from 'oxc-parser';
import { walk } from 'estree-walker';
import type { Node as EstreeWalkerNode } from 'estree-walker';
import { createCyclomaticVisitor } from '#src/cyclomatic.js';
import { createCognitiveVisitor } from '#src/cognitive/visitor.js';
import { getFunctionName as getProductionFunctionName } from '#src/utils.js';
import type { ESTreeNode, FunctionNode, ComplexityResult, Context } from '#src/types.js';

/**
 * Result of complexity calculation for a single function.
 * Extends the production ComplexityResult with a function name.
 */
export interface ComplexityFunctionResult extends ComplexityResult {
  name: string;
}

/**
 * Minimal mock of oxlint Context for testing.
 */
function createMockContext(): Context {
  return {
    sourceCode: {
      text: '',
      getText: () => '',
    },
    options: [],
    report: () => {},
  } as unknown as Context;
}

function getFunctionName(node: ESTreeNode, index: number): string {
  const funcNode = node as ESTreeNode & { parent?: ESTreeNode };
  const name = getProductionFunctionName(funcNode as FunctionNode, funcNode.parent);

  // Replace production anonymous placeholders with indexed names for clearer test output
  if (name === '<arrow>' || name === '<anonymous>') {
    return `anonymous_${index + 1}`;
  }

  return name;
}

/**
 * Walk an AST using estree-walker and call visitor handlers.
 */
function walkWithVisitor(
  ast: ESTreeNode,
  visitor: Record<string, ((node: ESTreeNode) => void) | undefined>
): void {
  walk(ast as EstreeWalkerNode, {
    enter(node, parent) {
      const esNode = node as unknown as ESTreeNode;

      // Set parent reference as non-enumerable to prevent walker from traversing it
      Object.defineProperty(esNode, 'parent', {
        value: parent as unknown as ESTreeNode,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      visitor[esNode.type]?.(esNode);
      visitor['*']?.(esNode);
    },
    leave(node) {
      const esNode = node as unknown as ESTreeNode;
      visitor[`${esNode.type}:exit`]?.(esNode);
      visitor['*:exit']?.(esNode);
    },
  });
}

/**
 * Generic complexity calculator that works with any visitor factory.
 */
function calculateComplexityWithVisitor(
  code: string,
  filename: string,
  type: 'cyclomatic' | 'cognitive'
): Map<string, ComplexityFunctionResult> {
  const { program, errors } = parseSync(filename, code);

  if (errors.length > 0) {
    throw new Error(`Parse errors in "${filename}": ${errors.map((e) => e.message).join(', ')}`);
  }

  const results = new Map<string, ComplexityFunctionResult>();
  let functionIndex = 0;

  const onComplexityCalculated = (result: ComplexityResult, node: ESTreeNode) => {
    const name = getFunctionName(node, functionIndex++);
    results.set(name, {
      name,
      ...result,
    });
  };

  // Cyclomatic visitor doesn't need context, cognitive still does
  const listener =
    type === 'cyclomatic'
      ? createCyclomaticVisitor(onComplexityCalculated)
      : createCognitiveVisitor(createMockContext(), onComplexityCalculated);

  walkWithVisitor(program as unknown as ESTreeNode, listener);

  return results;
}

/**
 * Calculate cyclomatic complexity for all functions in the given code
 */
export function calculateCyclomaticComplexity(
  code: string,
  filename = 'test.ts'
): Map<string, ComplexityFunctionResult> {
  return calculateComplexityWithVisitor(code, filename, 'cyclomatic');
}

/**
 * Calculate cognitive complexity for all functions in the given code
 */
export function calculateCognitiveComplexity(
  code: string,
  filename = 'test.ts'
): Map<string, ComplexityFunctionResult> {
  return calculateComplexityWithVisitor(code, filename, 'cognitive');
}

/**
 * Calculate both cyclomatic and cognitive complexity.
 */
export function calculateComplexity(
  code: string,
  filename = 'test.ts'
): {
  cyclomatic: Map<string, ComplexityFunctionResult>;
  cognitive: Map<string, ComplexityFunctionResult>;
} {
  return {
    cyclomatic: calculateCyclomaticComplexity(code, filename),
    cognitive: calculateCognitiveComplexity(code, filename),
  };
}
