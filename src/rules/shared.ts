import { defineRule } from '@oxlint/plugins';
import type {
  Rule,
  Context,
  Visitor,
  FunctionNode,
  ComplexityPoint,
  ComplexityResult,
  VisitorWithHooks,
  ESTreeNode,
  MaxCognitiveOptions,
} from '../types.js';
import {
  getFunctionName,
  summarizeComplexity,
  formatBreakdown,
  type BreakdownOptions,
} from '../utils.js';
import {
  analyzeExtractionOpportunities,
  shouldAnalyzeExtraction,
  formatExtractionSuggestions,
  type ExtractionOptions,
} from '../extraction/index.js';
import { getVariablesForFunction } from '../extraction/variable-tracker.js';

/**
 * Configuration for creating a simple complexity rule
 * (single metric, no extraction analysis).
 */
export interface ComplexityRuleConfig {
  metricName: string;
  defaultMax: number;
  schemaMinimum: number;
  description: string;
  url: string;

  /** Factory to create the visitor */
  createVisitor: (
    onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void
  ) => Visitor;

  /** Called once before the first file is processed */
  before?: () => void;

  normalizeCategory?: (category: string) => string;
}

export function createComplexityRule(config: ComplexityRuleConfig): Rule {
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
          const options = (context.options[0] ?? {}) as { max?: number };
          maxComplexity = options.max ?? config.defaultMax;
          config.before?.();
        },

        ...config.createVisitor((result, node) => {
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

export function normalizeCognitiveCategory(category: string): string {
  if (category.startsWith('logical operator')) return 'logical operators';
  if (category.startsWith('nested ')) return 'nested functions';
  if (category.startsWith('break to') || category.startsWith('continue to')) return 'labeled jumps';
  return category;
}

const MIGRATION_URL = 'https://github.com/itaymendel/oxlint-plugin-complexity#migration-to-v1';
const warnedDeprecations = new Set<string>();

export function warnDeprecated(ruleName: string): void {
  if (warnedDeprecations.has(ruleName)) return;
  warnedDeprecations.add(ruleName);

  // eslint-disable-next-line no-console -- Intentional deprecation warning
  console.warn(`
DEPRECATION WARNING: complexity/${ruleName}

   Use "complexity/complexity" instead for better performance:

   "complexity/complexity": ["warn", {
     "cyclomatic": 20,
     "cognitive": 15
   }]

   See: ${MIGRATION_URL}
`);
}

/** JSON Schema properties shared by rules that support extraction analysis and breakdown tips. */
export const EXTRACTION_SCHEMA_PROPERTIES = {
  extractionMultiplier: {
    type: 'number',
    minimum: 1,
    description: 'Multiplier for max complexity to trigger extraction suggestions (default: 1.5)',
  },
  minExtractionPercentage: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
    description: 'Minimum percentage of total complexity for an extraction candidate (default: 30)',
  },
  enableExtraction: {
    type: 'boolean',
    description: 'Enable smart extraction suggestions for complex functions (default: false)',
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
    description: 'Minimum else-if branches to show chain tip (default: 4, set to 0 to disable)',
  },
  logicalOperatorThreshold: {
    type: 'integer',
    minimum: 0,
    description: 'Minimum logical operator sequences to show tip (default: 3, set to 0 to disable)',
  },
} as const;

type ExtractionSchemaOptions = Omit<MaxCognitiveOptions, 'max'>;

export interface ParsedExtractionOptions {
  enableExtraction: boolean;
  extractionOptions: ExtractionOptions;
  breakdownOptions: BreakdownOptions;
}

export function parseExtractionOptions(options: ExtractionSchemaOptions): ParsedExtractionOptions {
  return {
    enableExtraction: options.enableExtraction ?? false,
    extractionOptions: {
      minComplexityMultiplier: options.extractionMultiplier,
      minComplexityPercentage: options.minExtractionPercentage,
    },
    breakdownOptions: {
      nestingTipThreshold: options.nestingTipThreshold,
      elseIfChainThreshold: options.elseIfChainThreshold,
      logicalOperatorThreshold: options.logicalOperatorThreshold,
    },
  };
}

/**
 * Analyze extraction opportunities and return formatted output.
 * Returns an empty string if extraction is disabled or complexity is below threshold.
 */
export function getExtractionOutput(
  parsed: ParsedExtractionOptions,
  context: Context,
  node: ESTreeNode,
  points: ComplexityPoint[],
  total: number,
  maxComplexity: number
): string {
  if (!parsed.enableExtraction) return '';
  if (!shouldAnalyzeExtraction(total, maxComplexity, parsed.extractionOptions)) return '';

  const variables = getVariablesForFunction(context, node);
  const suggestions = analyzeExtractionOpportunities(
    node,
    points,
    total,
    variables,
    parsed.extractionOptions
  );
  return formatExtractionSuggestions(suggestions);
}
