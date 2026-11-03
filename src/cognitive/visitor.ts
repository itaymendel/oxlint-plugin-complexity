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
  options: CognitiveVisitorOptions<TResult>
): Visitor {
  const { context: visitorCtx, baseVisitor } = createComplexityVisitor<CognitiveFunctionScope>({
    createScope: createCognitiveScope,

    onEnterFunction(parentScope, node, scope) {
      cognitive.onEnterFunction(parentScope, scope);

      if (isFunctionNode(node) && visitorCtx.getFunctionDepth() === 0) {
        options.onEnterTopLevelFunction?.(node);
      }
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

  const cognitive = createCognitiveHandlers({
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
 * - Functions, class field initializers, and static blocks are reported independently
 * - Nested units start at the enclosing scope's current nesting +1; top-level units at 0
 * - Declaring a nested function adds no complexity to its enclosing scope
 * - Recursion detection: +1 for direct recursive calls
 *
 * EXCLUDED PATTERNS:
 * - Default value patterns: `||`/`??` chains ending in a constant fallback (literal, `[]`, `{}`,
 *   `-1`, `undefined`, no-expression template, no-op callback), in any position
 * - JSX short-circuit: `{show && <Component />}`
 */
export function createCognitiveVisitor(
  onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void
): Visitor {
  return createCognitiveVisitorCore({ onComplexityCalculated });
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
  return createCognitiveVisitorCore<ComplexityResultWithVariables>({
    onExitTopLevelFunction(node) {
      const variables = getVariablesForFunction(context, node);
      const funcNode = node as FunctionNode;
      const functionName = getFunctionName(funcNode, funcNode.parent);
      return { variables, functionName };
    },

    onComplexityCalculated,
  });
}
