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

function detectMutations(
  candidate: ExtractionCandidate,
  variables: Map<string, VariableInfo>
): MutationInfo[] {
  const mutations: MutationInfo[] = [];

  for (const variable of variables.values()) {
    const declaredInRange =
      variable.declarationLine >= candidate.startLine &&
      variable.declarationLine <= candidate.endLine;
    if (declaredInRange) continue;

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

/** Check if a node is a closure (function expression or arrow function) */
function isClosureNode(node: ESTreeNode): boolean {
  return node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
}

/** Find the enclosing closure within the candidate range, if any */
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

/** Check if a reference is within the candidate range */
function isRefInRange(ref: { line: number }, candidate: ExtractionCandidate): boolean {
  return ref.line >= candidate.startLine && ref.line <= candidate.endLine;
}

function detectClosures(
  candidate: ExtractionCandidate,
  variables: Map<string, VariableInfo>
): ClosureInfo[] {
  const closures: ClosureInfo[] = [];

  for (const variable of variables.values()) {
    if (!variable.isMutable || variable.declarationLine >= candidate.startLine) continue;

    for (const ref of variable.references) {
      if (!isRefInRange(ref, candidate)) continue;

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

function isReturnInRange(n: ESTreeNode, startLine: number, endLine: number): boolean {
  return (
    n.type === 'ReturnStatement' &&
    !!n.loc &&
    n.loc.start.line >= startLine &&
    n.loc.start.line <= endLine
  );
}

/** Walk AST child properties, invoking `visit` on each child node. */
function walkChildren(n: ESTreeNode, visit: (child: ESTreeNode) => void): void {
  for (const key of Object.keys(n)) {
    if (SKIP_WALK_KEYS.has(key)) continue;
    const child = (n as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNodeLike(item)) visit(item);
      }
    } else if (isNodeLike(child)) {
      visit(child);
    }
  }
}

function collectReturnStatements(
  node: ESTreeNode,
  startLine: number,
  endLine: number
): ESTreeNode[] {
  const returns: ESTreeNode[] = [];

  function walk(n: ESTreeNode | null | undefined): void {
    if (!isNodeLike(n)) return;
    if (isOutsideRange(n, startLine, endLine)) return;
    if (n !== node && NESTED_FUNCTION_TYPES.has(n.type)) return;

    if (isReturnInRange(n, startLine, endLine)) {
      returns.push(n);
    }

    walkChildren(n, walk);
  }

  walk(node);
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

export function analyzeVariableFlow(
  candidate: ExtractionCandidate,
  variables: Map<string, VariableInfo>,
  functionNode: ESTreeNode,
  _functionEndLine: number
): VariableFlowAnalysis {
  const inputs: VariableInfo[] = [];
  const outputs: VariableInfo[] = [];
  const internalOnly: VariableInfo[] = [];

  for (const variable of variables.values()) {
    const declaredBefore = variable.declarationLine < candidate.startLine;
    const declaredInRange =
      variable.declarationLine >= candidate.startLine &&
      variable.declarationLine <= candidate.endLine;

    const readsInRange = hasReadsInRange(variable, candidate.startLine, candidate.endLine);
    const usedAfterRange = isUsedAfter(variable, candidate.endLine);

    if (declaredBefore && readsInRange) {
      inputs.push(variable);
    } else if (declaredInRange) {
      if (usedAfterRange) {
        outputs.push(variable);
      } else {
        internalOnly.push(variable);
      }
    }
  }

  const mutations = detectMutations(candidate, variables);
  const closures = detectClosures(candidate, variables);

  return {
    inputs,
    outputs,
    internalOnly,
    mutations,
    closures,
    hasEarlyReturn: hasEarlyReturn(candidate, functionNode),
  };
}
