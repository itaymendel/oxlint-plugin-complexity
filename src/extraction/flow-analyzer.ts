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

function hasEarlyReturn(candidate: ExtractionCandidate): boolean {
  return candidate.constructs.some((c) => c === 'if' || c === 'switch' || c === 'ternary operator');
}

export function analyzeVariableFlow(
  candidate: ExtractionCandidate,
  variables: Map<string, VariableInfo>,
  _functionNode: ESTreeNode,
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
    hasEarlyReturn: hasEarlyReturn(candidate),
  };
}
