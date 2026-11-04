import type { ESTreeNode } from '../types.js';
import { isFunctionNode } from '../utils.js';

export const LOOP_STATEMENTS: ReadonlySet<string> = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);

const SKIP_WALK_KEYS = new Set(['parent', 'loc', 'range']);

export function isNodeLike(value: unknown): value is ESTreeNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export function getNodeProp(n: ESTreeNode, key: string): unknown {
  return (n as unknown as Record<string, unknown>)[key];
}

export function getLine(n: ESTreeNode): number {
  return n.loc?.start.line ?? 0;
}

function isOutsideRange(n: ESTreeNode, startLine: number, endLine: number): boolean {
  return !!n.loc && (n.loc.end.line < startLine || n.loc.start.line > endLine);
}

export function walkChildren(n: ESTreeNode, visit: (child: ESTreeNode) => void): void {
  for (const key of Object.keys(n)) {
    if (SKIP_WALK_KEYS.has(key)) continue;
    const child = getNodeProp(n, key);
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNodeLike(item)) visit(item);
      }
    } else if (isNodeLike(child)) {
      visit(child);
    }
  }
}

/**
 * Nested functions and class members have their own `this`/scope.
 * Arrow functions only rebind `return`/`await`, not `this`, so `this` checks may enter them.
 */
export function isScopeBoundary(n: ESTreeNode, enterArrows: boolean): boolean {
  if (n.type === 'ClassBody') return true;
  return isFunctionNode(n) && !(enterArrows && n.type === 'ArrowFunctionExpression');
}

function walkTree(
  n: ESTreeNode,
  visitor: (n: ESTreeNode) => void,
  isOutside: (n: ESTreeNode) => boolean
): void {
  if (isOutside(n)) return;
  visitor(n);
  walkChildren(n, (child) => walkTree(child, visitor, isOutside));
}

export function walkInRange(
  root: ESTreeNode,
  startLine: number,
  endLine: number,
  visitor: (n: ESTreeNode) => void,
  enterArrows = false
): void {
  walkTree(
    root,
    visitor,
    (n) => isOutsideRange(n, startLine, endLine) || (n !== root && isScopeBoundary(n, enterArrows))
  );
}

/** Walk whole subtrees (no range filter), stopping at nested function/class boundaries. */
export function walkNodes(
  nodes: ESTreeNode[],
  visitor: (n: ESTreeNode) => void,
  enterArrows = false
): void {
  for (const node of nodes) {
    walkTree(node, visitor, (n) => isScopeBoundary(n, enterArrows));
  }
}

/** Variables of an enclosing function or static block are not tracked. */
export function isNestedFunction(functionNode: ESTreeNode): boolean {
  let current: ESTreeNode | null | undefined = functionNode.parent;
  while (current) {
    if (isFunctionNode(current) || current.type === 'StaticBlock') return true;
    current = current.parent;
  }
  return false;
}
