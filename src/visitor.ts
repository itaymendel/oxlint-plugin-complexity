import type {
  Visitor,
  ESTreeNode,
  FunctionScope,
  ComplexityResult,
  FunctionNode,
} from './types.js';
import { getFunctionName, createComplexityPoint } from './utils.js';

interface VisitorConfig<T extends FunctionScope> {
  createScope: (node: ESTreeNode, name: string | null) => T;
  onEnterFunction?: (parentScope: T | undefined, node: ESTreeNode, scope: T) => void;
  onExitFunction?: (scope: T, node: ESTreeNode) => void;
  onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void;
}

export interface VisitorContext<T extends FunctionScope> {
  scopeStack: T[];
  getCurrentScope: () => T | undefined;
  addComplexity: (node: ESTreeNode, message: string, amount?: number) => void;
}

/**
 * Create a complexity visitor with shared scope management.
 *
 * @param config - Configuration with scope factory and callbacks
 * @returns Context utilities and base visitor for function enter/exit
 */
export function createComplexityVisitor<T extends FunctionScope>(
  config: VisitorConfig<T>
): { context: VisitorContext<T>; baseVisitor: Partial<Visitor> } {
  const scopeStack: T[] = [];

  function getCurrentScope(): T | undefined {
    return scopeStack[scopeStack.length - 1];
  }

  function addComplexity(node: ESTreeNode, message: string, amount: number = 1): void {
    const scope = getCurrentScope();
    if (scope) {
      scope.points.push(createComplexityPoint(node, message, amount));
    }
  }

  const context: VisitorContext<T> = {
    scopeStack,
    getCurrentScope,
    addComplexity,
  };

  function enterFunction(node: ESTreeNode): void {
    const funcNode = node as FunctionNode;
    const name = getFunctionName(funcNode, node.parent ?? undefined);
    const parentScope = getCurrentScope();
    const scope = config.createScope(node, name);

    scopeStack.push(scope);
    config.onEnterFunction?.(parentScope, node, scope);
  }

  function exitFunction(node: ESTreeNode): void {
    const scope = scopeStack.pop();
    if (!scope) return;

    config.onExitFunction?.(scope, node);

    const total = scope.points.reduce((sum, point) => sum + point.complexity, 0);
    config.onComplexityCalculated({ total, points: scope.points }, node);
  }

  const baseVisitor: Partial<Visitor> = {
    FunctionDeclaration: enterFunction,
    FunctionExpression: enterFunction,
    ArrowFunctionExpression: enterFunction,
    'FunctionDeclaration:exit': exitFunction,
    'FunctionExpression:exit': exitFunction,
    'ArrowFunctionExpression:exit': exitFunction,
  };

  return { context, baseVisitor };
}
