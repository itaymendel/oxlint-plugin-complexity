import type {
  Visitor,
  ESTreeNode,
  FunctionScope,
  ComplexityResult,
  FunctionNode,
  PropertyDefinitionNode,
} from './types.js';
import {
  getFunctionName,
  createComplexityPoint,
  isFieldInitializerUnit,
  isFunctionNode,
} from './utils.js';

interface VisitorConfig<T extends FunctionScope> {
  createScope: (node: ESTreeNode, name: string | null) => T;
  onEnterFunction?: (parentScope: T | undefined, node: ESTreeNode, scope: T) => void;
  onExitFunction?: (scope: T, node: ESTreeNode) => void;
  onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void;
}

export interface VisitorContext<T extends FunctionScope> {
  scopeStack: T[];
  getScopeFor: (node: ESTreeNode) => T | undefined;
  getFunctionDepth: () => number;
  addComplexity: (node: ESTreeNode, message: string, amount?: number) => void;
}

function isInsideFieldValue(node: ESTreeNode, field: PropertyDefinitionNode): boolean {
  let current: ESTreeNode | undefined = node;
  while (current && current !== field) {
    if (current === field.value) return true;
    current = current.parent ?? undefined;
  }
  return false;
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
  let functionDepth = 0;

  function getCurrentScope(): T | undefined {
    return scopeStack[scopeStack.length - 1];
  }

  function getScopeFor(node: ESTreeNode): T | undefined {
    const scope = getCurrentScope();
    if (!scope || scope.node.type !== 'PropertyDefinition') return scope;
    if (isInsideFieldValue(node, scope.node)) return scope;
    return scopeStack[scopeStack.length - 2];
  }

  function addComplexity(node: ESTreeNode, message: string, amount: number = 1): void {
    const scope = getScopeFor(node);
    if (scope) {
      scope.points.push(createComplexityPoint(node, message, amount));
    }
  }

  const context: VisitorContext<T> = {
    scopeStack,
    getScopeFor,
    getFunctionDepth: () => functionDepth,
    addComplexity,
  };

  function enterFunction(node: ESTreeNode): void {
    const funcNode = node as FunctionNode;
    const name = getFunctionName(funcNode, node.parent ?? undefined);
    const parentScope = getCurrentScope();
    const scope = config.createScope(node, name);

    scopeStack.push(scope);
    config.onEnterFunction?.(parentScope, node, scope);
    if (isFunctionNode(node)) functionDepth++;
  }

  function exitFunction(node: ESTreeNode): void {
    const scope = getCurrentScope();
    if (scope?.node !== node) return;
    scopeStack.pop();

    if (isFunctionNode(node)) functionDepth--;
    config.onExitFunction?.(scope, node);

    const total = scope.points.reduce((sum, point) => sum + point.complexity, 0);
    config.onComplexityCalculated({ total, points: scope.points }, node);
  }

  function enterPropertyDefinition(node: ESTreeNode): void {
    if (isFieldInitializerUnit(node as PropertyDefinitionNode)) enterFunction(node);
  }

  const baseVisitor: Partial<Visitor> = {
    FunctionDeclaration: enterFunction,
    FunctionExpression: enterFunction,
    ArrowFunctionExpression: enterFunction,
    StaticBlock: enterFunction,
    PropertyDefinition: enterPropertyDefinition,
    'FunctionDeclaration:exit': exitFunction,
    'FunctionExpression:exit': exitFunction,
    'ArrowFunctionExpression:exit': exitFunction,
    'StaticBlock:exit': exitFunction,
    'PropertyDefinition:exit': exitFunction,
  };

  return { context, baseVisitor };
}
