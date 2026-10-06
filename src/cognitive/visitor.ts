import type { Context, Visitor, ESTreeNode, FunctionNode, ComplexityResult } from '../types.js';
import { getFunctionName, isFunctionNode } from '../utils.js';
import { createComplexityVisitor } from '../visitor.js';
import { getVariablesForFunction } from '../extraction/variable-tracker.js';
import type { VariableInfo } from '../extraction/types.js';
import {
  createCognitiveHandlers,
  createCognitiveScope,
  type CognitiveFunctionScope,
} from './handlers.js';

interface CognitiveVisitorOptions<TResult extends ComplexityResult> {
  onComplexityCalculated: (result: TResult, node: ESTreeNode) => void;
  onEnterTopLevelFunction?: (node: ESTreeNode) => void;
  onExitTopLevelFunction?: (node: ESTreeNode) => Partial<TResult>;
}

function createCognitiveVisitorCore<TResult extends ComplexityResult>(
  context: Context,
  options: CognitiveVisitorOptions<TResult>
): Visitor {
  const { context: visitorCtx, baseVisitor } = createComplexityVisitor<CognitiveFunctionScope>({
    createScope: createCognitiveScope,

    onEnterFunction(parentScope, node) {
      if (!isFunctionNode(node)) return;

      if (visitorCtx.getFunctionDepth() === 0) {
        options.onEnterTopLevelFunction?.(node);
      }

      cognitive.onEnterFunction(parentScope, node);
    },

    onExitFunction(scope, node) {
      cognitive.onExitFunction(scope, node);
    },

    onComplexityCalculated(result, node) {
      const isTopLevelFunction = isFunctionNode(node) && visitorCtx.getFunctionDepth() === 0;
      const additionalData = isTopLevelFunction
        ? (options.onExitTopLevelFunction?.(node) ?? {})
        : {};

      options.onComplexityCalculated({ ...result, ...additionalData } as TResult, node);
    },
  });

  const cognitive = createCognitiveHandlers(context, {
    getScopeFor: visitorCtx.getScopeFor,
    getPoints: (scope) => scope.points,
    pointFormat: 'standalone',
  });

  return { ...baseVisitor, ...cognitive.visitor };
}

/**
 * Calculate cognitive complexity for a function body.
 *
 * STRUCTURAL COMPLEXITY (+1 + nesting):
 * - if (except else-if), loops, switch, catch, ternary
 *
 * FLAT COMPLEXITY (+1 only):
 * - else-if, else, labeled break/continue, logical operators (per sequence)
 *
 * ADDITIONAL FEATURES:
 * - Nested function penalty: +1 for each level of function nesting
 * - Recursion detection: +1 for direct recursive calls
 *
 * EXCLUDED PATTERNS:
 * - Default value patterns: `const x = a || literal`, `a = a || literal`
 * - JSX short-circuit: `{show && <Component />}`
 */
export function createCognitiveVisitor(
  context: Context,
  onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void
): Visitor {
  return createCognitiveVisitorCore(context, { onComplexityCalculated });
}

export interface ComplexityResultWithVariables extends ComplexityResult {
  variables: Map<string, VariableInfo>;
  functionName: string;
}

/**
 * Create a cognitive complexity visitor that also tracks variables within functions.
 *
 * Uses oxlint's built-in scope manager to collect variable information,
 * which is then available in the complexity result for extraction analysis.
 */
export function createCognitiveVisitorWithTracking(
  context: Context,
  onComplexityCalculated: (result: ComplexityResultWithVariables, node: ESTreeNode) => void
): Visitor {
  return createCognitiveVisitorCore<ComplexityResultWithVariables>(context, {
    onExitTopLevelFunction(node) {
      const variables = getVariablesForFunction(context, node);
      const funcNode = node as FunctionNode;
      const functionName = getFunctionName(funcNode, funcNode.parent);
      return { variables, functionName };
    },

    onComplexityCalculated,
  });
}
