import type { Rule } from '../types.js';
import { createCyclomaticVisitor } from '../cyclomatic.js';
import { createComplexityRule, warnDeprecated } from './shared.js';

/**
 * Enforce a maximum cyclomatic complexity for functions.
 * Default threshold: 20
 *
 * @deprecated Use 'complexity/complexity' instead for better performance.
 */
export const maxCyclomatic: Rule = createComplexityRule({
  metricName: 'cyclomatic complexity',
  defaultMax: 20,
  schemaMinimum: 1,
  description: 'Enforce a maximum cyclomatic complexity for functions',
  url: 'https://github.com/itaymendel/oxlint-plugin-complexity#complexitymax-cyclomatic',
  before: () => warnDeprecated('max-cyclomatic'),
  createVisitor: createCyclomaticVisitor,
});
