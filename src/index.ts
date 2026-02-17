import { definePlugin } from '@oxlint/plugins';
import { complexity } from './rules/complexity.js';

// Re-export types for library users
export type {
  Plugin,
  Rule,
  Context,
  Visitor,
  FunctionScope,
  ComplexityPoint,
  ComplexityResult,
  MaxCyclomaticOptions,
  MaxCognitiveOptions,
} from './types.js';

// Re-export visitor factory for advanced usage
export { createComplexityVisitor } from './visitor.js';
export type { VisitorContext } from './visitor.js';

// Re-export calculators for programmatic use
export { createCyclomaticVisitor } from './cyclomatic.js';
export { createCognitiveVisitor } from './cognitive/visitor.js';

// Re-export combined visitor for advanced usage
export { createCombinedComplexityVisitor } from './combined-visitor.js';
export type { CombinedComplexityResult } from './combined-visitor.js';

// Re-export utilities
export { getFunctionName, createComplexityPoint, summarizeComplexity } from './utils.js';

// Re-export extraction analysis
export type {
  ExtractionSuggestion,
  ExtractionOptions,
  ExtractionCandidate,
  ExtractionConfidence,
  VariableFlowAnalysis,
  VariableInfo,
  TypedVariable,
  ExtractionIssue,
} from './extraction/index.js';
export {
  analyzeExtractionOpportunities,
  shouldAnalyzeExtraction,
  formatExtractionSuggestions,
} from './extraction/index.js';

/**
 * oxlint-plugin-complexity
 *
 * Provides cyclomatic and cognitive complexity rules for oxlint.
 *
 * Rules:
 * - complexity/complexity: Enforce both metrics in one pass
 */
const plugin = definePlugin({
  meta: {
    name: 'complexity',
  },
  rules: {
    complexity,
  },
});

export default plugin;
