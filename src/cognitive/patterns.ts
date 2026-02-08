import type { Context, ESTreeNode, LogicalExpressionNode, IfStatementNode } from '../types.js';
import { includes } from '../utils.js';

const DEFAULT_VALUE_OPERATORS = ['||', '??'] as const;
const LITERAL_TYPES = new Set(['Literal', 'ArrayExpression', 'ObjectExpression']);

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
  let current: ESTreeNode = node.right;
  while (
    current.type === 'LogicalExpression' &&
    operators.includes((current as LogicalExpressionNode).operator)
  ) {
    current = (current as LogicalExpressionNode).right;
  }
  return current;
}

function getChainRoot(
  node: LogicalExpressionNode,
  operators: readonly string[]
): LogicalExpressionNode {
  let current = node;
  while (
    current.parent?.type === 'LogicalExpression' &&
    operators.includes((current.parent as LogicalExpressionNode).operator)
  ) {
    current = current.parent as LogicalExpressionNode;
  }
  return current;
}

export function isDefaultValuePattern(node: LogicalExpressionNode, context: Context): boolean {
  const { operator } = node;

  if (!includes(DEFAULT_VALUE_OPERATORS, operator)) {
    return false;
  }

  const rightmost = getRightmostInChain(node, DEFAULT_VALUE_OPERATORS);
  if (!LITERAL_TYPES.has(rightmost.type)) {
    return false;
  }

  const root = getChainRoot(node, DEFAULT_VALUE_OPERATORS);
  const parent = root.parent;

  if (parent?.type === 'VariableDeclarator') {
    return true;
  }

  if (parent?.type === 'AssignmentExpression') {
    const assignment = parent as ESTreeNode & { left?: ESTreeNode };
    if (assignment.left) {
      // For self-assignment like `a = a || []`
      const leftText = context.sourceCode.getText(
        root.left as Parameters<typeof context.sourceCode.getText>[0]
      );
      const assignLeftText = context.sourceCode.getText(
        assignment.left as Parameters<typeof context.sourceCode.getText>[0]
      );
      return leftText === assignLeftText;
    }
  }

  return false;
}

export function isJsxShortCircuit(node: LogicalExpressionNode): boolean {
  if (node.operator !== '&&') {
    return false;
  }

  const rightmost = getRightmostInChain(node, ['&&']);
  return rightmost.type === 'JSXElement' || rightmost.type === 'JSXFragment';
}
