export * from './types.js';
export { formatExtractionSuggestions } from './formatter.js';

import type { ESTreeNode, ComplexityPoint } from '../types.js';
import type { ExtractionSuggestion, ExtractionOptions, VariableInfo } from './types.js';
import { findExtractionCandidates } from './boundary-detector.js';
import { analyzeVariableFlow } from './flow-analyzer.js';
export { PLACEHOLDER_FUNCTION_NAME } from './suggestion-generator.js';
import { createExtractionSuggestion } from './suggestion-generator.js';

const DEFAULT_MIN_COMPLEXITY_MULTIPLIER = 1.5;

export function analyzeExtractionOpportunities(
  functionNode: ESTreeNode,
  points: ComplexityPoint[],
  totalComplexity: number,
  variables: Map<string, VariableInfo>,
  options?: ExtractionOptions
): ExtractionSuggestion[] {
  if (!variables || variables.size === 0) {
    return [];
  }

  const candidates = findExtractionCandidates(points, totalComplexity, options);
  if (candidates.length === 0) {
    return [];
  }

  const suggestions: ExtractionSuggestion[] = [];

  for (const candidate of candidates) {
    const flow = analyzeVariableFlow(candidate, variables, functionNode);
    const suggestion = createExtractionSuggestion(candidate, flow);
    suggestions.push(suggestion);
  }

  return suggestions;
}

export function shouldAnalyzeExtraction(
  totalComplexity: number,
  maxComplexity: number,
  options?: ExtractionOptions
): boolean {
  const multiplier = options?.minComplexityMultiplier ?? DEFAULT_MIN_COMPLEXITY_MULTIPLIER;
  return totalComplexity > maxComplexity * multiplier;
}
