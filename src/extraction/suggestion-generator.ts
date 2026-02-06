import type {
  ExtractionCandidate,
  VariableFlowAnalysis,
  ExtractionSuggestion,
  ExtractionConfidence,
  ExtractionIssue,
  TypedVariable,
} from './types.js';

const MAX_HIGH_CONFIDENCE_INPUTS = 3;
const PLACEHOLDER_FUNCTION_NAME = 'extracted';
const MAX_HIGH_CONFIDENCE_OUTPUTS = 1;
const MAX_MEDIUM_CONFIDENCE_INPUTS = 5;
const MAX_MEDIUM_CONFIDENCE_OUTPUTS = 2;

function determineConfidence(flow: VariableFlowAnalysis): ExtractionConfidence {
  const inputCount = flow.inputs.length;
  const outputCount = flow.outputs.length;
  const hasMutations = flow.mutations.length > 0;
  const hasClosures = flow.closures.length > 0;
  const hasEarlyReturn = flow.hasEarlyReturn;

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
    hasEarlyReturn
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

function detectIssues(
  _candidate: ExtractionCandidate,
  flow: VariableFlowAnalysis
): ExtractionIssue[] {
  const issues: ExtractionIssue[] = [];

  for (const mutation of flow.mutations) {
    issues.push({
      type: 'mutation',
      description: `Mutates external variable '${mutation.variable.name}'`,
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

  if (flow.hasEarlyReturn) {
    issues.push({
      type: 'early-return',
      description: 'Contains early return statements that complicate extraction',
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
      case 'early-return':
        suggestions.push(
          'Consider restructuring to avoid early returns, or handle them explicitly'
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

export function createExtractionSuggestion(
  candidate: ExtractionCandidate,
  flow: VariableFlowAnalysis
): ExtractionSuggestion {
  const confidence = determineConfidence(flow);
  const issues = detectIssues(candidate, flow);
  const actionSuggestions = generateSuggestions(issues);

  const inputs = flow.inputs.map(toTypedVariable);
  const outputs = flow.outputs.map(toTypedVariable);

  let suggestedSignature: string | undefined;
  if (confidence !== 'low' && issues.length === 0) {
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
