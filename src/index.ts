import { definePlugin } from '@oxlint/plugins';
import { complexity } from './rules/complexity.js';

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

export { createComplexityVisitor } from './visitor.js';
export type { VisitorContext } from './visitor.js';

export { createCyclomaticVisitor } from './cyclomatic.js';
export { createCognitiveVisitor } from './cognitive/visitor.js';

export { createCombinedComplexityVisitor } from './combined-visitor.js';
export type { CombinedComplexityResult } from './combined-visitor.js';

export { getFunctionName, createComplexityPoint, summarizeComplexity } from './utils.js';

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

export type { HalsteadMetrics, HalsteadCounts } from './module/halstead.js';
export { calculateHalsteadMetrics, createHalsteadCounts } from './module/halstead.js';

export type {
  FunctionMetrics,
  AggregateComplexity,
  MIDecomposition,
  ModuleAnalysisResult,
  ModuleComplexityOptions,
} from './module/visitor.js';
export { calculateModuleComplexity, createModuleAnalysisVisitor } from './module/visitor.js';

export { analyzeModule } from './analyze.js';

/**
 * oxlint-plugin-complexity
 *
 * Provides cyclomatic and cognitive complexity rules for oxlint,
 * plus module-level analysis with Halstead metrics and module complexity scoring.
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
