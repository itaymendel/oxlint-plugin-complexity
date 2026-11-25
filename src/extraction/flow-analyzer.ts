import type { ESTreeNode } from '../types.js';
import type { VariableInfo, VariableFlowAnalysis, MutationInfo } from './types.js';
import { checkExtractionSafety, collectFunctionFacts } from './safety.js';
import type { UnitCandidate } from './unit-finder.js';
import { getLine, getNodeProp, isNodeLike, walkInRange, walkNodes } from './ast-utils.js';
import { analyzeControlFlow, detectThisReferences } from './control-flow.js';

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
  candidate: UnitCandidate,
  variables: ReadonlyMap<unknown, VariableInfo>
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

/**
 * Maps each resolved identifier reference node to the binding it refers to, so a mutation root
 * is resolved through the scope manager's references rather than by name.
 */
type ReferenceIndex = ReadonlyMap<ESTreeNode, VariableInfo>;

function buildReferenceIndex(variables: ReadonlyMap<unknown, VariableInfo>): ReferenceIndex {
  const index = new Map<ESTreeNode, VariableInfo>();
  for (const variable of variables.values()) {
    for (const ref of variable.references) index.set(ref.node, variable);
  }
  return index;
}

/**
 * Walk a MemberExpression chain (e.g. `a.b.c.d`) to its root Identifier.
 * Returns null for non-Identifier roots (e.g. `getObj().prop`).
 */
function resolveRootIdentifier(node: ESTreeNode): ESTreeNode | null {
  let current: ESTreeNode = node;
  while (current.type === 'MemberExpression') {
    const obj = getNodeProp(current, 'object');
    if (!isNodeLike(obj)) return null;
    current = obj;
  }
  return current.type === 'Identifier' ? current : null;
}

/**
 * Resolve a MemberExpression root to the binding its identifier references, if that binding is
 * declared outside the candidate range. Returns null if the root is not an identifier, does not
 * resolve to a tracked binding, or is declared within range.
 */
function findExternalVariable(
  memberExpr: ESTreeNode,
  references: ReferenceIndex,
  startLine: number,
  endLine: number
): VariableInfo | null {
  const root = resolveRootIdentifier(memberExpr);
  if (!root) return null;
  const variable = references.get(root);
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
  variables: ReferenceIndex,
  startLine: number,
  endLine: number
): MutationInfo | null {
  const left = getNodeProp(n, 'left');
  if (!isNodeLike(left) || left.type !== 'MemberExpression') return null;
  const variable = findExternalVariable(left, variables, startLine, endLine);
  if (!variable) return null;
  return { variable, mutationLine: getLine(n), mutationType: 'assignment' };
}

function checkPropertyUpdate(
  n: ESTreeNode,
  variables: ReferenceIndex,
  startLine: number,
  endLine: number
): MutationInfo | null {
  const arg = getNodeProp(n, 'argument');
  if (!isNodeLike(arg) || arg.type !== 'MemberExpression') return null;
  const variable = findExternalVariable(arg, variables, startLine, endLine);
  if (!variable) return null;
  return { variable, mutationLine: getLine(n), mutationType: 'increment' };
}

function checkMethodCallMutation(
  n: ESTreeNode,
  variables: ReferenceIndex,
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
  return { variable, mutationLine: getLine(n), mutationType: 'method-call' };
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
  candidate: UnitCandidate,
  variables: ReadonlyMap<unknown, VariableInfo>,
  functionNode: ESTreeNode
): MutationInfo[] {
  const mutations: MutationInfo[] = [];
  const { startLine, endLine } = candidate;
  const references = buildReferenceIndex(variables);

  const visit = (n: ESTreeNode): void => {
    const checker = AST_MUTATION_CHECKERS[n.type];
    if (!checker) return;
    const mutation = checker(n, references, startLine, endLine);
    if (mutation) mutations.push(mutation);
  };
  // A unit's nodes cover exactly its lines, so walk them instead of the whole function
  if (candidate.unit) walkNodes(candidate.unit.nodes, visit);
  else walkInRange(functionNode, startLine, endLine, visit);

  return mutations;
}

function deduplicateMutations(mutations: MutationInfo[]): MutationInfo[] {
  const seen = new Map<VariableInfo, Set<number>>();
  return mutations.filter((m) => {
    const lines = seen.get(m.variable) ?? new Set<number>();
    seen.set(m.variable, lines);
    if (lines.has(m.mutationLine)) return false;
    lines.add(m.mutationLine);
    return true;
  });
}

export function analyzeVariableFlow(
  candidate: UnitCandidate,
  variables: ReadonlyMap<unknown, VariableInfo>,
  functionNode: ESTreeNode,
  facts = collectFunctionFacts(variables, functionNode)
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
    ...detectDirectMutations(candidate, variables),
    ...detectAstMutations(candidate, variables, functionNode),
  ]);

  const { earlyExits, asyncBoundaries } = analyzeControlFlow(candidate, functionNode);

  return {
    inputs,
    outputs,
    internalOnly,
    mutations,
    ...checkExtractionSafety(candidate, { inputs, outputs }, facts),
    hasEarlyReturn: earlyExits.length > 0,
    hasThisReference: detectThisReferences(candidate, functionNode),
    earlyExits,
    asyncBoundaries,
  };
}
