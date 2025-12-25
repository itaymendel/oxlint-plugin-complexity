import type { ESTreeNode, CallExpressionNode } from '../types.js';

const CALL_APPLY_BIND = new Set(['call', 'apply', 'bind']);

function getPropertyName(prop: ESTreeNode, computed: boolean): string | null {
  if (!computed && prop?.type === 'Identifier') {
    return prop.name;
  }
  if (computed && prop?.type === 'Literal' && typeof prop.value === 'string') {
    return prop.value;
  }
  return null;
}

/** Check for direct recursion: foo() inside function foo */
function isDirectRecursion(callee: ESTreeNode, functionName: string): boolean {
  return callee?.type === 'Identifier' && callee.name === functionName;
}

/** Check for foo.call(...), foo.apply(...), foo.bind(...)(...) */
function isCallApplyBindRecursion(callee: ESTreeNode, functionName: string): boolean {
  if (callee?.type !== 'MemberExpression') return false;
  if (callee.object?.type !== 'Identifier') return false;
  if (callee.object.name !== functionName) return false;
  if (callee.property?.type !== 'Identifier') return false;
  return CALL_APPLY_BIND.has(callee.property.name);
}

/** Check for this.foo() or this["foo"]() inside method foo */
function isThisMethodRecursion(callee: ESTreeNode, functionName: string): boolean {
  if (callee?.type !== 'MemberExpression') return false;
  if (callee.object?.type !== 'ThisExpression') return false;
  const propName = getPropertyName(callee.property, callee.computed ?? false);
  return propName === functionName;
}

/** Check for this.foo.call(...), this.foo.apply(...), etc. */
function isThisMethodCallApplyBindRecursion(callee: ESTreeNode, functionName: string): boolean {
  if (callee?.type !== 'MemberExpression') return false;
  if (callee.object?.type !== 'MemberExpression') return false;
  if (callee.object.object?.type !== 'ThisExpression') return false;
  if (callee.property?.type !== 'Identifier') return false;
  if (!CALL_APPLY_BIND.has(callee.property.name)) return false;
  const propName = getPropertyName(callee.object.property, callee.object.computed ?? false);
  return propName === functionName;
}

/**
 * Check if a call expression is a recursive call to the current function.
 *
 * Detects:
 * - Direct recursion: foo() inside function foo
 * - Call/apply/bind: foo.call(...), foo.apply(...), foo.bind(...)()
 * - Method recursion: this.foo() or this["foo"]() inside method foo
 * - Method with call/apply/bind: this.foo.call(...), etc.
 */
export function isRecursiveCall(node: CallExpressionNode, functionName: string): boolean {
  const callee = node.callee as ESTreeNode;

  return (
    isDirectRecursion(callee, functionName) ||
    isCallApplyBindRecursion(callee, functionName) ||
    isThisMethodRecursion(callee, functionName) ||
    isThisMethodCallApplyBindRecursion(callee, functionName)
  );
}
