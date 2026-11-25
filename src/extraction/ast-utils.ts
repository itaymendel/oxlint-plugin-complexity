import type { Reference } from '@oxlint/plugins';
import type { ESTreeNode } from '../types.js';
import { isFunctionNode, isTransparentExpression } from '../utils.js';

export const LOOP_STATEMENTS: ReadonlySet<string> = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);

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
    if (key === 'parent') continue;
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
 * Nested functions, static blocks and class field initializers have their own `this`/scope.
 * Arrow functions only rebind `return`/`await`, not `this`, so `this` checks may enter them.
 * A class body itself is not a boundary: computed keys, decorators and `extends` expressions
 * are evaluated in the enclosing function (see `walkLexicalChildren`).
 */
export function isScopeBoundary(n: ESTreeNode, enterArrows: boolean): boolean {
  if (n.type === 'StaticBlock') return true;
  return isFunctionNode(n) && !(enterArrows && n.type === 'ArrowFunctionExpression');
}

const FIELD_NODES = new Set(['PropertyDefinition', 'AccessorProperty']);

/** Like `walkChildren`, but skips what runs in another context: the value of a class field. */
export function walkLexicalChildren(n: ESTreeNode, visit: (child: ESTreeNode) => void): void {
  if (!FIELD_NODES.has(n.type)) return walkChildren(n, visit);
  const value = getNodeProp(n, 'value');
  walkChildren(n, (child) => {
    if (child !== value) visit(child);
  });
}

function walkTree(
  n: ESTreeNode,
  visitor: (n: ESTreeNode) => void,
  isOutside: (n: ESTreeNode) => boolean
): void {
  if (isOutside(n)) return;
  visitor(n);
  walkLexicalChildren(n, (child) => walkTree(child, visitor, isOutside));
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

type WriteKind = 'write' | 'readwrite';

const isIn = (list: unknown, child: ESTreeNode): boolean =>
  Array.isArray(list) && list.includes(child);

/** For each parent that can hold an assignment target: how it writes `child`, or null. */
const TARGET_PARENTS: Record<string, (parent: ESTreeNode, child: ESTreeNode) => WriteKind | null> =
  {
    AssignmentExpression: (parent, child) => {
      if (getNodeProp(parent, 'left') !== child) return null;
      return getNodeProp(parent, 'operator') === '=' ? 'write' : 'readwrite';
    },
    UpdateExpression: () => 'readwrite',
    ForInStatement: (parent, child) => (getNodeProp(parent, 'left') === child ? 'write' : null),
    ForOfStatement: (parent, child) => (getNodeProp(parent, 'left') === child ? 'write' : null),
    ArrayPattern: (parent, child) =>
      isIn(getNodeProp(parent, 'elements'), child) ? 'write' : null,
    Property: (parent, child) =>
      getNodeProp(parent, 'value') === child && parent.parent?.type === 'ObjectPattern'
        ? 'write'
        : null,
    AssignmentPattern: (parent, child) => (getNodeProp(parent, 'left') === child ? 'write' : null),
    RestElement: () => 'write',
  };

/**
 * How an identifier that sits inside transparent wrappers is written, when it is the target of an
 * assignment, update, `for-in/of` head or destructuring. The scope manager sees most of these
 * (`(x as T) = 1`) but not all (`(x satisfies T) = 1` is reported as a read), so every wrapper is
 * resolved here. Null when it is not a write through a wrapper.
 */
export function writeThroughWrapper(identifier: ESTreeNode): WriteKind | null {
  let child = identifier;
  let parent = child.parent as ESTreeNode | null | undefined;
  while (parent && isTransparentExpression(parent) && getNodeProp(parent, 'expression') === child) {
    child = parent;
    parent = child.parent as ESTreeNode | null | undefined;
  }
  // Without a wrapper the scope manager's own answer stands
  if (child === identifier || !parent) return null;
  return TARGET_PARENTS[parent.type]?.(parent, child) ?? null;
}

/** A write, including one through a wrapper that the scope manager reports as a read. */
export function isWrite(ref: Reference): boolean {
  return ref.isWrite() || writeThroughWrapper(ref.identifier as unknown as ESTreeNode) !== null;
}
