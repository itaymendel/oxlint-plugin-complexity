import type { ESTreeNode, LogicalExpressionNode, IfStatementNode } from '../types.js';
import { includes, unwrapExpression } from '../utils.js';

const DEFAULT_VALUE_OPERATORS = ['||', '??'] as const;
const LITERAL_TYPES = new Set(['Literal', 'ArrayExpression', 'ObjectExpression']);

export function isElseIf(node: IfStatementNode): boolean {
  const parent = node.parent as IfStatementNode | undefined;
  return parent?.type === 'IfStatement' && parent.alternate === node;
}

function skipParensDown(node: ESTreeNode): ESTreeNode {
  let current = node;
  while (current.type === 'ParenthesizedExpression') {
    current = (current as ESTreeNode & { expression: ESTreeNode }).expression;
  }
  return current;
}

/**
 * Nearest ancestor that is not a ParenthesizedExpression. The oxlint runtime AST never contains
 * parentheses, but parsers that preserve them do, so structure checks must skip them.
 */
export function skipParensUp(node: ESTreeNode): ESTreeNode | undefined {
  let parent = node.parent ?? undefined;
  while (parent?.type === 'ParenthesizedExpression') {
    parent = parent.parent ?? undefined;
  }
  return parent;
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
  let current = skipParensDown(node.right);
  while (
    current.type === 'LogicalExpression' &&
    operators.includes((current as LogicalExpressionNode).operator)
  ) {
    current = skipParensDown((current as LogicalExpressionNode).right);
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
  return (operator === '-' || operator === '+') && isNumericLiteral(skipParensDown(argument));
}

function isConstantFallback(node: ESTreeNode): boolean {
  const unwrapped = unwrapExpression(node);
  if (LITERAL_TYPES.has(unwrapped.type)) return true;

  switch (unwrapped.type) {
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

/**
 * A `||` / `??` chain whose rightmost operand is a constant fallback, in any position:
 * literal, array/object literal, signed number, `undefined`, template literal without
 * expressions, or no-op callback (also through parentheses and TS `as`/`satisfies`/`!`/`<T>x`).
 */
export function isDefaultValuePattern(node: LogicalExpressionNode): boolean {
  if (!includes(DEFAULT_VALUE_OPERATORS, node.operator)) {
    return false;
  }

  return isConstantFallback(getRightmostInChain(node, DEFAULT_VALUE_OPERATORS));
}

export function isJsxShortCircuit(node: LogicalExpressionNode): boolean {
  if (node.operator !== '&&') {
    return false;
  }

  const rightmost = getRightmostInChain(node, ['&&']);
  return rightmost.type === 'JSXElement' || rightmost.type === 'JSXFragment';
}
