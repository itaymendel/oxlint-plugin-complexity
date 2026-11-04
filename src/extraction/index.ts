export * from './types.js';
export { formatExtractionSuggestions } from './formatter.js';

import type { ESTreeNode, ComplexityPoint } from '../types.js';
import type { ExtractionSuggestion, ExtractionOptions, VariableInfo } from './types.js';
import { findExtractionCandidates, selectBest } from './boundary-detector.js';
import { analyzeVariableFlow } from './flow-analyzer.js';
import { createExtractionSuggestion, markNested } from './suggestion-generator.js';
import { isNestedFunction } from './ast-utils.js';

const DEFAULT_MIN_COMPLEXITY_MULTIPLIER = 1.5;

export function analyzeExtractionOpportunities(
  functionNode: ESTreeNode,
  points: ComplexityPoint[],
  totalComplexity: number,
  variables: Map<string, VariableInfo>,
  options?: ExtractionOptions
): ExtractionSuggestion[] {
  if (variables.size === 0) {
    return [];
  }

  const candidates = findExtractionCandidates(functionNode, points, totalComplexity, options);
  if (candidates.length === 0) {
    return [];
  }

  const ranked = candidates.map((candidate) => {
    const flow = analyzeVariableFlow(candidate, variables, functionNode);
    return { candidate, flow, suggestion: createExtractionSuggestion(candidate, flow) };
  });
  const selected = selectBest(ranked, options);
  return isNestedFunction(functionNode) ? selected.map(markNested) : selected;
}

export function shouldAnalyzeExtraction(
  totalComplexity: number,
  maxComplexity: number,
  options?: ExtractionOptions
): boolean {
  const multiplier = options?.minComplexityMultiplier ?? DEFAULT_MIN_COMPLEXITY_MULTIPLIER;
  return totalComplexity > maxComplexity * multiplier;
}
