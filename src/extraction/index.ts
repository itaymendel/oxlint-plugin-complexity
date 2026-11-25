export * from './types.js';
export { formatExtractionSuggestions } from './formatter.js';

import type { ESTreeNode, ComplexityPoint } from '../types.js';
import type { ExtractionSuggestion, ExtractionOptions, VariableInfo } from './types.js';
import { findExtractionCandidates, selectBest } from './boundary-detector.js';
import { analyzeVariableFlow } from './flow-analyzer.js';
import { collectFunctionFacts } from './safety.js';
import { createExtractionSuggestion, markNested } from './suggestion-generator.js';
import { isNestedFunction } from './ast-utils.js';

const DEFAULT_MIN_COMPLEXITY_MULTIPLIER = 1.5;

export function analyzeExtractionOpportunities(
  functionNode: ESTreeNode,
  points: ComplexityPoint[],
  totalComplexity: number,
  variables: ReadonlyMap<unknown, VariableInfo> | (() => ReadonlyMap<unknown, VariableInfo>),
  options?: ExtractionOptions
): ExtractionSuggestion[] {
  const candidates = findExtractionCandidates(functionNode, points, totalComplexity, options);
  if (candidates.length === 0) {
    return [];
  }

  // Building scope information is expensive, so it waits until there is a candidate
  const tracked = typeof variables === 'function' ? variables() : variables;
  if (tracked.size === 0) {
    return [];
  }

  const facts = collectFunctionFacts(tracked, functionNode, options);
  const ranked = candidates.map((candidate) => {
    const flow = analyzeVariableFlow(candidate, tracked, functionNode, facts);
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
