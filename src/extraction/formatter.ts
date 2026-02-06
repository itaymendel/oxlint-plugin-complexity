import type { ExtractionSuggestion, TypedVariable } from './types.js';
import { getConfidenceLabel } from './suggestion-generator.js';

function formatVariableList(variables: TypedVariable[]): string {
  if (variables.length === 0) return 'none';
  return variables.map((v) => (v.type ? `${v.name}: ${v.type}` : v.name)).join(', ');
}

function formatSuggestion(suggestion: ExtractionSuggestion): string {
  const lines: string[] = [];

  const confidenceLabel = getConfidenceLabel(suggestion.confidence);
  lines.push(`  Lines ${suggestion.range.start}-${suggestion.range.end}: ${confidenceLabel}`);

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
    lines.push(`    Suggested: ${suggestion.suggestedSignature}`);
  }

  for (const issue of suggestion.issues) {
    const lineInfo = issue.line ? ` (line ${issue.line})` : '';
    lines.push(`    Issue: ${issue.description}${lineInfo}`);
  }

  if (suggestion.suggestions.length > 0 && suggestion.confidence === 'low') {
    for (const sug of suggestion.suggestions) {
      lines.push(`    Suggestion: ${sug}`);
    }
  }

  return lines.join('\n');
}

export function formatExtractionSuggestions(suggestions: ExtractionSuggestion[]): string {
  if (suggestions.length === 0) return '';

  const header = '\n\nSmart extraction suggestions:';
  const formattedSuggestions = suggestions.map(formatSuggestion).join('\n\n');

  return `${header}\n\n${formattedSuggestions}`;
}
