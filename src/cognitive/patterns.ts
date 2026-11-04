import type { ESTreeNode, LogicalExpressionNode, IfStatementNode } from '../types.js';
import { includes, isTransparentExpression, unwrapExpression } from '../utils.js';

const DEFAULT_VALUE_OPERATORS = ['||', '??'] as const;

export function isElseIf(node: IfStatementNode): boolean {
  const parent = node.parent as IfStatementNode | undefined;
  return parent?.type === 'IfStatement' && parent.alternate === node;
}

/**
 * Follow the right branch of a logical expression chain.
 * Continues while the operator matches one of the given operators.
 *
 * @param node - Starting logical expression
 * @param operators - Operators to follow (e.g., ["||", "??"] or ["&&"])
 * @returns The rightmost node in the chain
 */
function getRightmostInChain(
  node: LogicalExpressionNode,
  operators: readonly string[]
): ESTreeNode {
  let current = node.right;
  while (
    current.type === 'LogicalExpression' &&
    operators.includes((current as LogicalExpressionNode).operator)
  ) {
    current = (current as LogicalExpressionNode).right;
  }
  return current;
}

function isNumericLiteral(node: ESTreeNode): boolean {
  if (node.type !== 'Literal') return false;
  const { value } = node as ESTreeNode & { value: unknown };
  return typeof value === 'number' || typeof value === 'bigint';
}

// Defaults and destructuring can run code, so only plain and rest identifiers qualify
function isSimpleParam(param: ESTreeNode): boolean {
  return (
    param.type === 'Identifier' ||
    (param.type === 'RestElement' &&
      (param as ESTreeNode & { argument: ESTreeNode }).argument.type === 'Identifier')
  );
}

function isNoopCallback(node: ESTreeNode): boolean {
  if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') {
    return false;
  }
  const fn = node as ESTreeNode & {
    async: boolean;
    generator: boolean;
    params: ESTreeNode[];
    body: ESTreeNode & { body?: unknown[] };
  };
  return (
    !fn.async &&
    !fn.generator &&
    fn.params.every(isSimpleParam) &&
    fn.body.type === 'BlockStatement' &&
    fn.body.body?.length === 0
  );
}

function isSignedNumber(node: ESTreeNode): boolean {
  const { operator, argument } = node as ESTreeNode & { operator: string; argument: ESTreeNode };
  return (operator === '-' || operator === '+') && isNumericLiteral(argument);
}

// Holes count as constant; spreads are not constant fallbacks, so they fail the element check
function isConstantArray(node: ESTreeNode): boolean {
  const { elements } = node as ESTreeNode & { elements: Array<ESTreeNode | null> };
  return elements.every((element) => element === null || isConstantFallback(element));
}

// Spreads, computed keys, methods and accessors can run code
function isConstantProperty(property: ESTreeNode): boolean {
  if (property.type !== 'Property') return false;
  const { computed, method, kind, value } = property as ESTreeNode & {
    computed: boolean;
    method: boolean;
    kind: string;
    value: ESTreeNode;
  };
  return !computed && !method && kind === 'init' && isConstantFallback(value);
}

function isConstantObject(node: ESTreeNode): boolean {
  return (node as ESTreeNode & { properties: ESTreeNode[] }).properties.every(isConstantProperty);
}

function isConstantFallback(node: ESTreeNode): boolean {
  const unwrapped = unwrapExpression(node);

  switch (unwrapped.type) {
    case 'Literal':
      return true;
    case 'ArrayExpression':
      return isConstantArray(unwrapped);
    case 'ObjectExpression':
      return isConstantObject(unwrapped);
    case 'UnaryExpression':
      return isSignedNumber(unwrapped);
    case 'Identifier':
      return (unwrapped as ESTreeNode & { name: string }).name === 'undefined';
    case 'TemplateLiteral':
      return (unwrapped as ESTreeNode & { expressions: unknown[] }).expressions.length === 0;
    default:
      return isNoopCallback(unwrapped);
  }
}

function isConditionOf(parent: ESTreeNode, child: ESTreeNode): boolean {
  switch (parent.type) {
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
    case 'ConditionalExpression':
      return (parent as ESTreeNode & { test: ESTreeNode | null }).test === child;
    default:
      return false;
  }
}

function isTransparentForCondition(parent: ESTreeNode): boolean {
  return (
    isTransparentExpression(parent) ||
    parent.type === 'LogicalExpression' ||
    (parent.type === 'UnaryExpression' &&
      (parent as ESTreeNode & { operator: string }).operator === '!')
  );
}

/**
 * Whether the expression is a branch condition, directly or through TS wrappers, `!`,
 * or as an operand of an enclosing logical expression.
 */
function isInConditionPosition(node: ESTreeNode): boolean {
  let child = node;
  let parent = node.parent ?? undefined;
  while (parent && isTransparentForCondition(parent)) {
    child = parent;
    parent = parent.parent ?? undefined;
  }
  return parent !== undefined && isConditionOf(parent, child);
}

function countChainOperands(node: ESTreeNode): number {
  if (
    node.type !== 'LogicalExpression' ||
    !includes(DEFAULT_VALUE_OPERATORS, (node as LogicalExpressionNode).operator)
  ) {
    return 1;
  }
  const { left, right } = node as LogicalExpressionNode;
  return countChainOperands(left) + countChainOperands(right);
}

/**
 * A `||` / `??` chain whose rightmost operand is a constant fallback, in any position:
 * literal, constant array/object literal, signed number, `undefined`, template literal without
 * expressions, or no-op callback (also through TS `as`/`satisfies`/`!`/`<T>x`).
 * In a condition (`if`, loops, ternary test) only a single operand before the fallback is
 * exempt, so a trailing constant cannot hide real conditions.
 */
export function isDefaultValuePattern(node: LogicalExpressionNode): boolean {
  if (!includes(DEFAULT_VALUE_OPERATORS, node.operator)) {
    return false;
  }
  if (!isConstantFallback(getRightmostInChain(node, DEFAULT_VALUE_OPERATORS))) {
    return false;
  }

  return countChainOperands(node) === 2 || !isInConditionPosition(node);
}

export function isJsxShortCircuit(node: LogicalExpressionNode): boolean {
  if (node.operator !== '&&') {
    return false;
  }

  const rightmost = getRightmostInChain(node, ['&&']);
  return rightmost.type === 'JSXElement' || rightmost.type === 'JSXFragment';
}
