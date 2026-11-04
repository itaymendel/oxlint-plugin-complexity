import type {
  ExtractionCandidate,
  VariableFlowAnalysis,
  EarlyExit,
  AsyncBoundary,
  ExtractionSuggestion,
  ExtractionConfidence,
  ExtractionIssue,
  TypedVariable,
} from './types.js';

const MAX_HIGH_CONFIDENCE_INPUTS = 3;
export const PLACEHOLDER_FUNCTION_NAME = 'extracted';
const MAX_HIGH_CONFIDENCE_OUTPUTS = 1;
const MAX_MEDIUM_CONFIDENCE_INPUTS = 5;
const MAX_MEDIUM_CONFIDENCE_OUTPUTS = 2;

/** Structural hazards that make the signature unsafe to apply as-is, though data flow is clean. */
function hasStructuralHazard(flow: VariableFlowAnalysis): boolean {
  return flow.hasEarlyReturn || flow.hasThisReference || !!flow.asyncBoundaries?.length;
}

function determineConfidence(flow: VariableFlowAnalysis): ExtractionConfidence {
  const inputCount = flow.inputs.length;
  const outputCount = flow.outputs.length;
  const hasMutations = flow.mutations.length > 0;
  const hasClosures = flow.closures.length > 0;

  // Low confidence conditions
  if (
    inputCount > MAX_MEDIUM_CONFIDENCE_INPUTS ||
    outputCount > MAX_MEDIUM_CONFIDENCE_OUTPUTS ||
    hasMutations ||
    hasClosures
  ) {
    return 'low';
  }

  // Medium confidence conditions
  if (
    inputCount > MAX_HIGH_CONFIDENCE_INPUTS ||
    outputCount > MAX_HIGH_CONFIDENCE_OUTPUTS ||
    hasStructuralHazard(flow)
  ) {
    return 'medium';
  }

  return 'high';
}

function generateSignature(
  functionName: string,
  inputs: TypedVariable[],
  outputs: TypedVariable[]
): string {
  const params = inputs.map((v) => (v.type ? `${v.name}: ${v.type}` : v.name)).join(', ');

  let returnType: string;
  if (outputs.length === 0) {
    returnType = 'void';
  } else if (outputs.length === 1) {
    returnType = outputs[0].type || 'unknown';
  } else {
    const properties = outputs.map((v) => (v.type ? `${v.name}: ${v.type}` : v.name)).join(', ');
    returnType = `{ ${properties} }`;
  }

  return `${functionName}(${params}): ${returnType}`;
}

/** `noun` or `N nouns` — the formatter appends the line of the first occurrence. */
function countNoun(count: number, noun: string): string {
  return count > 1 ? `${count} ${noun}s` : noun;
}

function groupByKind<T extends { kind: string }>(items: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.kind);
    if (group) group.push(item);
    else groups.set(item.kind, [item]);
  }
  return [...groups.values()];
}

function describeReturns(returns: EarlyExit[]): string {
  const hasValue = returns.some((exit) => exit.hasArgument);
  if (returns.every((exit) => exit.replaceable)) {
    const alternative = hasValue ? '' : ' or `extracted(...); return;`';
    return `Contains ${countNoun(returns.length, 'return')}; replace the whole block with \`return extracted(...)\`${alternative}`;
  }
  const remedy = hasValue
    ? 'return `{ exit: true, value }` from the helper (and `{ exit: false }` otherwise) and forward it: `const r = extracted(...); if (r.exit) return r.value;`'
    : 'return a flag from the helper: `if (extracted(...)) return;`';
  return `Contains ${countNoun(returns.length, 'early return')} exiting the enclosing function; ${remedy}`;
}

/** The helper reports the jump; name the target only when the whole group shares one. */
function describeJumpRemedy(jumps: EarlyExit[]): string {
  const { kind, label } = jumps[0];
  if (jumps.some((jump) => jump.label !== label)) {
    return `return which target to jump to from the helper and \`${kind}\` there at the call site`;
  }
  return `return a flag from the helper and \`${label ? `${kind} ${label}` : kind}\` at the call site`;
}

function describeJumps(jumps: EarlyExit[]): string {
  const { kind } = jumps[0];
  const target = kind === 'continue' ? 'a loop' : 'a statement';
  const subject = jumps.length > 1 ? countNoun(jumps.length, `'${kind}' statement`) : `'${kind}'`;
  return `Contains ${subject} targeting ${target} outside the block; ${describeJumpRemedy(jumps)}`;
}

function describeAsync(boundaries: AsyncBoundary[]): string {
  const { kind } = boundaries[0];
  const noun = countNoun(boundaries.length, kind);
  const remedy =
    kind === 'await'
      ? 'make the helper async and `await` it at the call site'
      : 'make the helper a generator and call it with `yield*`';
  return `Contains ${noun}; ${remedy}`;
}

/** Early exits and await/yield reuse the `early-return` issue type with their own wording. */
function detectExitIssues(flow: VariableFlowAnalysis): ExtractionIssue[] {
  const exits = flow.earlyExits ?? [];
  const returns = exits.filter((exit) => exit.kind === 'return');
  const jumpGroups = groupByKind(exits.filter((exit) => exit.kind !== 'return'));
  const asyncGroups = groupByKind(flow.asyncBoundaries ?? []);

  const issues: ExtractionIssue[] = [];
  if (returns.length > 0) {
    issues.push({
      type: 'early-return',
      description: describeReturns(returns),
      line: returns[0].line,
    });
  }
  for (const jumps of jumpGroups) {
    issues.push({ type: 'early-return', description: describeJumps(jumps), line: jumps[0].line });
  }
  for (const boundaries of asyncGroups) {
    issues.push({
      type: 'early-return',
      description: describeAsync(boundaries),
      line: boundaries[0].line,
    });
  }
  // Hand-built flow results may set the flag without listing the exits
  if (issues.length === 0 && flow.hasEarlyReturn) {
    issues.push({
      type: 'early-return',
      description: 'Contains early return statements that complicate extraction',
    });
  }
  return issues;
}

function detectIssues(flow: VariableFlowAnalysis): ExtractionIssue[] {
  const issues: ExtractionIssue[] = [];

  for (const mutation of flow.mutations) {
    const desc =
      mutation.mutationType === 'method-call'
        ? `Mutates external variable '${mutation.variable.name}' via method call`
        : `Mutates external variable '${mutation.variable.name}'`;
    issues.push({
      type: 'mutation',
      description: desc,
      line: mutation.mutationLine,
      variable: mutation.variable.name,
    });
  }

  for (const closure of flow.closures) {
    issues.push({
      type: 'closure',
      description: `Closure captures mutable variable '${closure.variable.name}'`,
      line: closure.closureStartLine,
      variable: closure.variable.name,
    });
  }

  if (flow.inputs.length > MAX_MEDIUM_CONFIDENCE_INPUTS) {
    issues.push({
      type: 'too-many-params',
      description: `Would require ${flow.inputs.length} parameters`,
    });
  }

  if (flow.outputs.length > MAX_MEDIUM_CONFIDENCE_OUTPUTS) {
    issues.push({
      type: 'multiple-outputs',
      description: `Would require returning ${flow.outputs.length} values`,
    });
  }

  issues.push(...detectExitIssues(flow));

  if (flow.hasThisReference) {
    issues.push({
      type: 'this-reference',
      description:
        'Block references `this`, `arguments`, `super` or `new.target`, which complicates extraction',
    });
  }

  return issues;
}

function generateSuggestions(issues: ExtractionIssue[]): string[] {
  const suggestions: string[] = [];

  for (const issue of issues) {
    switch (issue.type) {
      case 'mutation':
        suggestions.push(`Consider returning '${issue.variable}' instead of mutating it`);
        break;
      case 'closure':
        suggestions.push(`Pass '${issue.variable}' as a parameter instead of closing over it`);
        break;
      case 'too-many-params':
        suggestions.push('Consider grouping related parameters into an options object');
        break;
      case 'multiple-outputs':
        suggestions.push('Consider using a single object return type');
        break;
      case 'this-reference':
        suggestions.push(
          'Block references `this` — extracted function will need `.call(this)` or accept the instance as a parameter'
        );
        break;
    }
  }

  return [...new Set(suggestions)];
}

function toTypedVariable(variable: { name: string; typeAnnotation?: string }): TypedVariable {
  return {
    name: variable.name,
    type: variable.typeAnnotation,
  };
}

/**
 * Variables of an enclosing function are not tracked, so the inputs of a block in a nested
 * function can be incomplete: never claim its signature is safe to apply.
 */
const NESTED_FUNCTION_ISSUE: ExtractionIssue = {
  type: 'closure',
  description:
    "Inside a nested function: variables of the enclosing function aren't listed as inputs; pass them in or keep the helper nested",
};

export function createExtractionSuggestion(
  candidate: ExtractionCandidate,
  flow: VariableFlowAnalysis
): ExtractionSuggestion {
  const confidence = determineConfidence(flow);
  const issues = detectIssues(flow);
  const actionSuggestions = generateSuggestions(issues);

  const inputs = flow.inputs.map(toTypedVariable);
  const outputs = flow.outputs.map(toTypedVariable);

  let suggestedSignature: string | undefined;
  if (issues.length === 0) {
    suggestedSignature = generateSignature(PLACEHOLDER_FUNCTION_NAME, inputs, outputs);
  }

  return {
    range: {
      start: candidate.startLine,
      end: candidate.endLine,
    },
    complexity: candidate.complexity,
    complexityPercentage: candidate.complexityPercentage,
    confidence,
    inputs,
    outputs,
    suggestedSignature,
    issues,
    suggestions: actionSuggestions,
  };
}

/** Applied after selection so that ranking is the same as for a top-level function. */
export function markNested(suggestion: ExtractionSuggestion): ExtractionSuggestion {
  return {
    ...suggestion,
    suggestedSignature: undefined,
    issues: [...suggestion.issues, NESTED_FUNCTION_ISSUE],
    confidence: suggestion.confidence === 'high' ? 'medium' : suggestion.confidence,
  };
}

export function getConfidenceLabel(confidence: ExtractionConfidence): string {
  switch (confidence) {
    case 'high':
      return 'Extractable with minimal changes';
    case 'medium':
      return 'Extractable with some refactoring';
    case 'low':
      return 'Requires significant refactoring';
  }
}
