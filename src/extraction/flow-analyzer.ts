import type { ESTreeNode } from '../types.js';
import type {
  VariableInfo,
  ExtractionCandidate,
  VariableFlowAnalysis,
  MutationInfo,
  ClosureInfo,
} from './types.js';

function hasReadsInRange(variable: VariableInfo, startLine: number, endLine: number): boolean {
  return variable.references.some(
    (ref) =>
      (ref.type === 'read' || ref.type === 'readwrite') &&
      ref.line >= startLine &&
      ref.line <= endLine
  );
}

function isUsedAfter(variable: VariableInfo, endLine: number): boolean {
  return variable.references.some((ref) => ref.line > endLine);
}

function getWritesInRange(
  variable: VariableInfo,
  startLine: number,
  endLine: number
): Array<{ line: number; type: 'write' | 'readwrite' }> {
  return variable.references
    .filter(
      (ref) =>
        (ref.type === 'write' || ref.type === 'readwrite') &&
        ref.line >= startLine &&
        ref.line <= endLine
    )
    .map((ref) => ({ line: ref.line, type: ref.type as 'write' | 'readwrite' }));
}

function isDeclaredInRange(variable: VariableInfo, startLine: number, endLine: number): boolean {
  return variable.declarationLine >= startLine && variable.declarationLine <= endLine;
}

function detectDirectMutations(
  candidate: ExtractionCandidate,
  variables: Map<string, VariableInfo>
): MutationInfo[] {
  const mutations: MutationInfo[] = [];

  for (const variable of variables.values()) {
    if (isDeclaredInRange(variable, candidate.startLine, candidate.endLine)) continue;

    const writes = getWritesInRange(variable, candidate.startLine, candidate.endLine);
    for (const write of writes) {
      mutations.push({
        variable,
        mutationLine: write.line,
        mutationType: write.type === 'readwrite' ? 'increment' : 'assignment',
      });
    }
  }

  return mutations;
}

function isClosureNode(node: ESTreeNode): boolean {
  return node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
}

function findEnclosingClosure(
  startNode: ESTreeNode | null | undefined,
  candidate: ExtractionCandidate
): { startLine: number; endLine: number } | null {
  let current: ESTreeNode | null | undefined = startNode;
  while (current) {
    if (isClosureNode(current)) {
      const funcLine = current.loc?.start.line ?? 0;
      const funcEndLine = current.loc?.end.line ?? 0;
      if (funcLine >= candidate.startLine && funcEndLine <= candidate.endLine) {
        return { startLine: funcLine, endLine: funcEndLine };
      }
    }
    current = current.parent;
  }
  return null;
}

function detectClosures(
  candidate: ExtractionCandidate,
  variables: Map<string, VariableInfo>
): ClosureInfo[] {
  const closures: ClosureInfo[] = [];

  for (const variable of variables.values()) {
    if (!variable.isMutable || variable.declarationLine >= candidate.startLine) continue;

    for (const ref of variable.references) {
      if (ref.line < candidate.startLine || ref.line > candidate.endLine) continue;

      const closure = findEnclosingClosure(ref.node.parent, candidate);
      if (closure) {
        closures.push({
          variable,
          closureStartLine: closure.startLine,
          closureEndLine: closure.endLine,
          issue: `Captures mutable variable '${variable.name}'`,
        });
      }
    }
  }

  const seen = new Set<string>();
  return closures.filter((c) => {
    const key = c.variable.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const NESTED_FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const SKIP_WALK_KEYS = new Set(['parent', 'loc', 'range']);

function isNodeLike(value: unknown): value is ESTreeNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function isOutsideRange(n: ESTreeNode, startLine: number, endLine: number): boolean {
  return !!n.loc && (n.loc.end.line < startLine || n.loc.start.line > endLine);
}

function getNodeProp(n: ESTreeNode, key: string): unknown {
  return (n as unknown as Record<string, unknown>)[key];
}

/**
 * Walk a MemberExpression chain (e.g. `a.b.c.d`) to its root Identifier.
 * Returns null for non-Identifier roots (e.g. `getObj().prop`).
 */
function resolveRootIdentifier(node: ESTreeNode): string | null {
  let current: ESTreeNode = node;
  while (current.type === 'MemberExpression') {
    const obj = getNodeProp(current, 'object');
    if (!isNodeLike(obj)) return null;
    current = obj;
  }
  if (current.type === 'Identifier') {
    return getNodeProp(current, 'name') as string;
  }
  return null;
}

function walkChildren(n: ESTreeNode, visit: (child: ESTreeNode) => void): void {
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

function walkInRange(
  root: ESTreeNode,
  startLine: number,
  endLine: number,
  visitor: (n: ESTreeNode) => void
): void {
  function walk(n: ESTreeNode): void {
    if (isOutsideRange(n, startLine, endLine)) return;
    if (n !== root && NESTED_FUNCTION_TYPES.has(n.type)) return;
    visitor(n);
    walkChildren(n, walk);
  }
  walk(root);
}

/**
 * Resolve a MemberExpression root to a variable declared outside the candidate range.
 * Returns null if the root is not an identifier, unknown, or declared within range.
 */
function findExternalVariable(
  memberExpr: ESTreeNode,
  variables: Map<string, VariableInfo>,
  startLine: number,
  endLine: number
): VariableInfo | null {
  const rootName = resolveRootIdentifier(memberExpr);
  if (!rootName) return null;
  const variable = variables.get(rootName);
  if (!variable || isDeclaredInRange(variable, startLine, endLine)) return null;
  return variable;
}

const MUTATING_METHODS = new Set([
  // Array
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  // Map / Set
  'set',
  'add',
  'delete',
  'clear',
]);

function checkPropertyAssignment(
  n: ESTreeNode,
  variables: Map<string, VariableInfo>,
  startLine: number,
  endLine: number
): MutationInfo | null {
  const left = getNodeProp(n, 'left');
  if (!isNodeLike(left) || left.type !== 'MemberExpression') return null;
  const variable = findExternalVariable(left, variables, startLine, endLine);
  if (!variable) return null;
  return { variable, mutationLine: n.loc?.start.line ?? 0, mutationType: 'assignment' };
}

function checkPropertyUpdate(
  n: ESTreeNode,
  variables: Map<string, VariableInfo>,
  startLine: number,
  endLine: number
): MutationInfo | null {
  const arg = getNodeProp(n, 'argument');
  if (!isNodeLike(arg) || arg.type !== 'MemberExpression') return null;
  const variable = findExternalVariable(arg, variables, startLine, endLine);
  if (!variable) return null;
  return { variable, mutationLine: n.loc?.start.line ?? 0, mutationType: 'increment' };
}

function checkMethodCallMutation(
  n: ESTreeNode,
  variables: Map<string, VariableInfo>,
  startLine: number,
  endLine: number
): MutationInfo | null {
  const callee = getNodeProp(n, 'callee');
  if (!isNodeLike(callee) || callee.type !== 'MemberExpression') return null;
  const prop = getNodeProp(callee, 'property');
  if (!isNodeLike(prop) || prop.type !== 'Identifier') return null;
  const methodName = getNodeProp(prop, 'name') as string;
  if (!MUTATING_METHODS.has(methodName)) return null;
  const variable = findExternalVariable(callee, variables, startLine, endLine);
  if (!variable) return null;
  return { variable, mutationLine: n.loc?.start.line ?? 0, mutationType: 'method-call' };
}

const AST_MUTATION_CHECKERS: Record<string, typeof checkPropertyAssignment> = {
  AssignmentExpression: checkPropertyAssignment,
  UpdateExpression: checkPropertyUpdate,
  CallExpression: checkMethodCallMutation,
};

/**
 * Detect property assignments (obj.x = ...), update expressions (obj.x++),
 * and mutating method calls (arr.push(...)) on variables declared outside the candidate range.
 */
function detectAstMutations(
  candidate: ExtractionCandidate,
  variables: Map<string, VariableInfo>,
  functionNode: ESTreeNode
): MutationInfo[] {
  const mutations: MutationInfo[] = [];
  const { startLine, endLine } = candidate;

  walkInRange(functionNode, startLine, endLine, (n) => {
    const checker = AST_MUTATION_CHECKERS[n.type];
    if (!checker) return;
    const mutation = checker(n, variables, startLine, endLine);
    if (mutation) mutations.push(mutation);
  });

  return mutations;
}

function collectReturnStatements(
  node: ESTreeNode,
  startLine: number,
  endLine: number
): ESTreeNode[] {
  const returns: ESTreeNode[] = [];

  walkInRange(node, startLine, endLine, (n) => {
    if (
      n.type === 'ReturnStatement' &&
      n.loc &&
      n.loc.start.line >= startLine &&
      n.loc.start.line <= endLine
    ) {
      returns.push(n);
    }
  });

  return returns;
}

function hasEarlyReturn(candidate: ExtractionCandidate, functionNode: ESTreeNode): boolean {
  const returns = collectReturnStatements(functionNode, candidate.startLine, candidate.endLine);

  if (returns.length === 0) return false;
  if (returns.length > 1) return true;

  // Single return: only flag if not near the end of the candidate.
  // Allow 1 line of slack for the closing brace.
  const returnLine = returns[0].loc?.start.line ?? 0;
  return returnLine < candidate.endLine - 1;
}

function detectThisReferences(candidate: ExtractionCandidate, functionNode: ESTreeNode): boolean {
  let found = false;
  walkInRange(functionNode, candidate.startLine, candidate.endLine, (n) => {
    if (n.type === 'ThisExpression') {
      found = true;
    }
  });
  return found;
}

function deduplicateMutations(mutationSets: MutationInfo[][]): MutationInfo[] {
  const seen = new Set<string>();
  const result: MutationInfo[] = [];
  for (const set of mutationSets) {
    for (const m of set) {
      const key = `${m.variable.name}:${m.mutationLine}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(m);
      }
    }
  }
  return result;
}

export function analyzeVariableFlow(
  candidate: ExtractionCandidate,
  variables: Map<string, VariableInfo>,
  functionNode: ESTreeNode
): VariableFlowAnalysis {
  const inputs: VariableInfo[] = [];
  const outputs: VariableInfo[] = [];
  const internalOnly: VariableInfo[] = [];

  for (const variable of variables.values()) {
    const declaredBefore = variable.declarationLine < candidate.startLine;
    const declaredInside = isDeclaredInRange(variable, candidate.startLine, candidate.endLine);

    const readsInRange = hasReadsInRange(variable, candidate.startLine, candidate.endLine);
    const usedAfterRange = isUsedAfter(variable, candidate.endLine);

    if (declaredBefore && readsInRange) {
      inputs.push(variable);
    } else if (declaredInside) {
      if (usedAfterRange) {
        outputs.push(variable);
      } else {
        internalOnly.push(variable);
      }
    }
  }

  const mutations = deduplicateMutations([
    detectDirectMutations(candidate, variables),
    detectAstMutations(candidate, variables, functionNode),
  ]);

  const closures = detectClosures(candidate, variables);

  return {
    inputs,
    outputs,
    internalOnly,
    mutations,
    closures,
    hasEarlyReturn: hasEarlyReturn(candidate, functionNode),
    hasThisReference: detectThisReferences(candidate, functionNode),
  };
}
