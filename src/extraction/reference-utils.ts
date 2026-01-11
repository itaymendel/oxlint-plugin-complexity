import type { ESTreeNode } from '../types.js';

interface VariableDeclaratorNode {
  type: string;
  id: ESTreeNode;
  init?: ESTreeNode;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

interface FunctionLikeNode {
  type: string;
  params: ESTreeNode[];
  body: ESTreeNode;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

interface AssignmentExpressionNode {
  type: string;
  left: ESTreeNode;
  right: ESTreeNode;
  operator: string;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

interface UpdateExpressionNode {
  type: string;
  argument: ESTreeNode;
  operator: string;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

// eslint-disable-next-line complexity/max-cyclomatic -- AST node type switch
export function isReadReference(node: ESTreeNode): boolean {
  const parent = node.parent;
  if (!parent) return true;

  switch (parent.type) {
    case 'VariableDeclarator': {
      const decl = parent as VariableDeclaratorNode;
      return decl.id !== node;
    }
    case 'AssignmentExpression': {
      const assign = parent as AssignmentExpressionNode;
      return assign.left !== node;
    }
    case 'UpdateExpression': {
      return false;
    }
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      const func = parent as FunctionLikeNode;
      return !func.params.includes(node);
    }
    case 'Property': {
      const prop = parent as ESTreeNode & {
        key: ESTreeNode;
        shorthand: boolean;
        value: ESTreeNode;
      };
      if (prop.key === node && !prop.shorthand) return false;
      return prop.value === node || prop.shorthand;
    }
    case 'MemberExpression': {
      const member = parent as ESTreeNode & {
        object: ESTreeNode;
        property: ESTreeNode;
        computed: boolean;
      };
      return member.object === node || (member.computed && member.property === node);
    }
    default:
      return true;
  }
}

export function isWriteReference(node: ESTreeNode): boolean {
  const parent = node.parent;
  if (!parent) return false;

  switch (parent.type) {
    case 'AssignmentExpression': {
      const assign = parent as AssignmentExpressionNode;
      if (assign.left === node) return true;
      // For compound assignments like +=, the left side is also read
      if (assign.left.type === 'MemberExpression') {
        const member = assign.left as ESTreeNode & { object: ESTreeNode };
        return member.object === node;
      }
      return false;
    }
    case 'UpdateExpression': {
      const update = parent as UpdateExpressionNode;
      return update.argument === node;
    }
    default:
      return false;
  }
}

export function getReferenceType(node: ESTreeNode): 'read' | 'write' | 'readwrite' | null {
  const parent = node.parent;

  // Check for update expressions first (++, --)
  if (parent?.type === 'UpdateExpression') {
    return 'readwrite';
  }

  // Check for compound assignments (+=, -=, etc.)
  if (parent?.type === 'AssignmentExpression') {
    const assign = parent as AssignmentExpressionNode;
    if (assign.left === node) {
      return assign.operator === '=' ? 'write' : 'readwrite';
    }
  }

  const isRead = isReadReference(node);
  const isWrite = isWriteReference(node);

  if (isRead && isWrite) return 'readwrite';
  if (isWrite) return 'write';
  if (isRead) return 'read';
  return null;
}
