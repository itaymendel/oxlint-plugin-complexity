import { defineRule } from 'oxlint/plugins';
import type {
  Rule,
  Context,
  Visitor,
  FunctionNode,
  ComplexityResult,
  VisitorWithHooks,
  ESTreeNode,
} from './types.js';
import {
  getFunctionName,
  summarizeComplexity,
  formatBreakdown,
  type BreakdownOptions,
} from './utils.js';
import { createCyclomaticVisitor } from './cyclomatic.js';
import {
  createCognitiveVisitorWithTracking,
  type ComplexityResultWithVariables,
} from './cognitive/visitor.js';
import {
  analyzeExtractionOpportunities,
  shouldAnalyzeExtraction,
  formatExtractionSuggestions,
  type ExtractionOptions,
} from './extraction/index.js';

/**
 * Configuration for creating a complexity rule.
 */
interface ComplexityRuleConfig {
  metricName: string;
  defaultMax: number;
  schemaMinimum: number;
  description: string;
  url: string;

  /** Factory to create the visitor */
  createVisitor: (
    context: Context,
    onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void
  ) => Visitor;

  normalizeCategory?: (category: string) => string;
}

function createComplexityRule(config: ComplexityRuleConfig): Rule {
  return defineRule({
    meta: {
      type: 'suggestion',
      docs: {
        description: config.description,
        recommended: false,
        url: config.url,
      },
      schema: [
        {
          type: 'object',
          properties: {
            max: {
              type: 'integer',
              minimum: config.schemaMinimum,
            },
          },
          additionalProperties: false,
        },
      ],
    },

    createOnce(context: Context) {
      let maxComplexity = config.defaultMax;

      return {
        before() {
          const options = (context.options[0] || {}) as { max?: number };
          maxComplexity = options.max ?? config.defaultMax;
        },

        ...config.createVisitor(context, (result, node) => {
          if (result.total > maxComplexity) {
            const funcNode = node as FunctionNode;
            const name = getFunctionName(funcNode, funcNode.parent);
            const summary = summarizeComplexity(result.points, config.normalizeCategory);
            const breakdown = formatBreakdown(result.points);

            context.report({
              node,
              message: `Function '${name}' has ${config.metricName} of ${result.total}. Maximum allowed is ${maxComplexity}.${summary}${breakdown}`,
            });
          }
        }),
      } as VisitorWithHooks;
    },
  });
}

function normalizeCognitiveCategory(category: string): string {
  if (category.startsWith('logical operator')) return 'logical operators';
  if (category.startsWith('nested ')) return 'nested functions';
  if (category.startsWith('break to') || category.startsWith('continue to')) return 'labeled jumps';
  return category;
}

/**
 * Enforce a maximum cyclomatic complexity for functions.
 * Default threshold: 20
 */
export const maxCyclomatic = createComplexityRule({
  metricName: 'cyclomatic complexity',
  defaultMax: 20,
  schemaMinimum: 1,
  description: 'Enforce a maximum cyclomatic complexity for functions',
  url: 'https://github.com/itaymendel/oxlint-plugin-complexity#complexitymax-cyclomatic',
  createVisitor: (_context, onComplexityCalculated) =>
    createCyclomaticVisitor(onComplexityCalculated),
});

/**
 * Enforce a maximum cognitive complexity for functions.
 * Default threshold: 15
 *
 * For functions that significantly exceed the threshold (>150% of max),
 * provides Smart Extraction Detection suggestions for refactoring.
 */
export const maxCognitive: Rule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Cognitive Complexity of functions should not be too high',
      recommended: false,
      url: 'https://github.com/itaymendel/oxlint-plugin-complexity#complexitymax-cognitive',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: {
            type: 'integer',
            minimum: 0,
          },
          extractionMultiplier: {
            type: 'number',
            minimum: 1,
            description:
              'Multiplier for max complexity to trigger extraction suggestions (default: 1.5)',
          },
          minExtractionPercentage: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            description:
              'Minimum percentage of total complexity for an extraction candidate (default: 30)',
          },
          enableExtraction: {
            type: 'boolean',
            description:
              'Enable smart extraction suggestions for complex functions (default: false)',
          },
          nestingTipThreshold: {
            type: 'integer',
            minimum: 0,
            description:
              'Minimum nesting depth to show extraction tip on top offender (default: 3, set to 0 to disable)',
          },
          elseIfChainThreshold: {
            type: 'integer',
            minimum: 0,
            description:
              'Minimum else-if branches to show chain tip (default: 4, set to 0 to disable)',
          },
          logicalOperatorThreshold: {
            type: 'integer',
            minimum: 0,
            description:
              'Minimum logical operator sequences to show tip (default: 3, set to 0 to disable)',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  createOnce(context: Context) {
    const DEFAULT_MAX = 15;
    let maxComplexity = DEFAULT_MAX;
    let enableExtraction = false;
    let extractionOptions: ExtractionOptions | undefined;
    let breakdownOptions: BreakdownOptions | undefined;

    return {
      before() {
        const options = (context.options[0] || {}) as {
          max?: number;
          enableExtraction?: boolean;
          extractionMultiplier?: number;
          minExtractionPercentage?: number;
          nestingTipThreshold?: number;
          elseIfChainThreshold?: number;
          logicalOperatorThreshold?: number;
        };
        maxComplexity = options.max ?? DEFAULT_MAX;
        enableExtraction = options.enableExtraction ?? false;

        // Build extraction options if any are provided
        if (
          options.extractionMultiplier !== undefined ||
          options.minExtractionPercentage !== undefined
        ) {
          extractionOptions = {
            minComplexityMultiplier: options.extractionMultiplier,
            minComplexityPercentage: options.minExtractionPercentage,
          };
        }

        // Build breakdown options if any tip thresholds are specified
        if (
          options.nestingTipThreshold !== undefined ||
          options.elseIfChainThreshold !== undefined ||
          options.logicalOperatorThreshold !== undefined
        ) {
          breakdownOptions = {
            nestingTipThreshold: options.nestingTipThreshold,
            elseIfChainThreshold: options.elseIfChainThreshold,
            logicalOperatorThreshold: options.logicalOperatorThreshold,
          };
        }
      },

      ...createCognitiveVisitorWithTracking(
        context,
        (result: ComplexityResultWithVariables, node: ESTreeNode) => {
          if (result.total > maxComplexity) {
            const summary = summarizeComplexity(result.points, normalizeCognitiveCategory);
            const breakdown = formatBreakdown(result.points, breakdownOptions);

            // Add extraction suggestions if enabled and complexity is significant (default: >150% of max)
            let extractionOutput = '';
            if (
              enableExtraction &&
              shouldAnalyzeExtraction(result.total, maxComplexity, extractionOptions)
            ) {
              const suggestions = analyzeExtractionOpportunities(
                node,
                result.points,
                result.total,
                result.variables,
                result.functionName,
                extractionOptions
              );
              extractionOutput = formatExtractionSuggestions(suggestions);
            }

            context.report({
              node,
              message: `Function '${result.functionName}' has Cognitive Complexity of ${result.total}. Maximum allowed is ${maxComplexity}.${summary}${breakdown}${extractionOutput}`,
            });
          }
        }
      ),
    } as VisitorWithHooks;
  },
});
