import type { ExtractionSuggestion, TypedVariable } from './types.js';
import { getConfidenceLabel, printVariable } from './suggestion-generator.js';

function formatVariableList(variables: TypedVariable[]): string {
  if (variables.length === 0) return 'none';
  return variables.map(printVariable).join(', ');
}

function formatTypeNotes(suggestion: ExtractionSuggestion): string[] {
  return (suggestion.typeNotes ?? []).map((note) => `    ${note}`);
}

/** With type notes the label must not suggest the types are proven. */
function formatLabel(suggestion: ExtractionSuggestion): string {
  const typesToCheck = suggestion.typeNotes?.length ? ', but check the types listed below' : '';
  return getConfidenceLabel(suggestion.confidence) + typesToCheck;
}

function formatIssues(suggestion: ExtractionSuggestion): string[] {
  const lines = suggestion.issues.map(
    (issue) => `    Issue: ${issue.description}${issue.line ? ` (line ${issue.line})` : ''}`
  );
  if (suggestion.confidence === 'low') {
    lines.push(...suggestion.suggestions.map((sug) => `    Suggestion: ${sug}`));
  }
  return lines;
}

function formatSuggestion(suggestion: ExtractionSuggestion): string {
  const lines: string[] = [];

  lines.push(
    `  Lines ${suggestion.range.start}-${suggestion.range.end}: ${formatLabel(suggestion)}`
  );

  lines.push(
    `    Complexity: +${suggestion.complexity} (${suggestion.complexityPercentage}% of total)`
  );

  if (suggestion.inputs.length > 0) {
    lines.push(`    Inputs: ${formatVariableList(suggestion.inputs)}`);
  }

  if (suggestion.outputs.length > 0) {
    lines.push(`    Outputs: ${formatVariableList(suggestion.outputs)}`);
  }

  if (suggestion.suggestedSignature) {
    lines.push(`    Suggested: ${suggestion.suggestedSignature}`, ...formatTypeNotes(suggestion));
  }

  lines.push(...formatIssues(suggestion));
  return lines.join('\n');
}

export function formatExtractionSuggestions(suggestions: ExtractionSuggestion[]): string {
  if (suggestions.length === 0) return '';

  const header = '\n\nSmart extraction suggestions:';
  const formattedSuggestions = suggestions.map(formatSuggestion).join('\n\n');

  return `${header}\n\n${formattedSuggestions}`;
}
