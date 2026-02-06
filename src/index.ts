import { definePlugin } from 'oxlint/plugins';
import { maxCyclomatic, maxCognitive } from './rules.js';

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

// Re-export utilities
export { getFunctionName, createComplexityPoint, summarizeComplexity } from './utils.js';

/**
 * oxlint-plugin-complexity
 *
 * Provides cyclomatic and cognitive complexity rules for oxlint.
 *
 * Rules:
 * - complexity/max-cyclomatic: Enforce maximum cyclomatic complexity
 * - complexity/max-cognitive: Enforce maximum cognitive complexity
 */
const plugin = definePlugin({
  meta: {
    name: 'complexity',
  },
  rules: {
    'max-cyclomatic': maxCyclomatic,
    'max-cognitive': maxCognitive,
  },
});

export default plugin;
