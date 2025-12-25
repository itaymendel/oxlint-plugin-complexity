import type {
  ESTreeNode,
  FunctionNode,
  LogicalExpressionNode,
  ConditionalExpressionNode,
  BlockStatementNode,
} from '../types.js';

function containsJsx(node: ESTreeNode | null | undefined): boolean {
  if (!node) return false;

  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return true;
  }

  // Handle conditional: condition ? <A /> : <B />
  if (node.type === 'ConditionalExpression') {
    const condNode = node as ConditionalExpressionNode;
    return (
      containsJsx(condNode.consequent as ESTreeNode) ||
      containsJsx(condNode.alternate as ESTreeNode)
    );
  }

  // Handle logical expressions: show && <Component /> or show || <Fallback />
  if (node.type === 'LogicalExpression') {
    const logicNode = node as LogicalExpressionNode;
    return containsJsx(logicNode.left as ESTreeNode) || containsJsx(logicNode.right as ESTreeNode);
  }

  return false;
}

/** Check if a return statement contains JSX */
function checkReturnStatement(statement: ESTreeNode): boolean {
  if (statement.type !== 'ReturnStatement') return false;
  const returnStmt = statement as { argument?: ESTreeNode | null };
  return containsJsx(returnStmt.argument);
}

/** Check if a statement has a body block containing JSX returns */
function checkBodyBlock(statement: ESTreeNode): boolean {
  if (!('body' in statement) || !statement.body) return false;
  const body = statement.body;
  if (Array.isArray(body) || body.type !== 'BlockStatement') return false;
  return hasJsxReturn(body as BlockStatementNode);
}

/** Check if a statement has a consequent block containing JSX returns */
function checkConsequentBlock(statement: ESTreeNode): boolean {
  if (!('consequent' in statement) || !statement.consequent) return false;
  const consequent = statement.consequent as ESTreeNode;
  if (consequent.type !== 'BlockStatement') return false;
  return hasJsxReturn(consequent as BlockStatementNode);
}

function hasJsxReturn(node: BlockStatementNode): boolean {
  if (!node?.body) return false;

  return node.body.some(
    (statement) =>
      checkReturnStatement(statement) ||
      checkBodyBlock(statement) ||
      checkConsequentBlock(statement)
  );
}

/**
 * Check if a function looks like a React functional component
 * - Name starts with uppercase letter
 * - Returns JSX
 */
export function isReactComponent(node: FunctionNode, name: string | null): boolean {
  if (!name || !/^[A-Z]/.test(name)) {
    return false;
  }

  // Check if function body returns JSX
  // MethodDefinition has value.body, Function/Arrow have body directly
  const body = 'value' in node ? node.value.body : 'body' in node ? node.body : null;
  if (!body) return false;

  // Arrow function with direct JSX return: () => <div />
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    return true;
  }

  // Function with block body - check for JSX returns
  if (body.type === 'BlockStatement') {
    return hasJsxReturn(body as BlockStatementNode);
  }

  return false;
}
