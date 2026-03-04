import type { Context, ComplexityPoint, ESTreeNode, MaxCognitiveOptions } from '../types.js';
import { type BreakdownOptions } from '../utils.js';
import {
  analyzeExtractionOpportunities,
  shouldAnalyzeExtraction,
  formatExtractionSuggestions,
  type ExtractionOptions,
} from '../extraction/index.js';
import { getVariablesForFunction } from '../extraction/variable-tracker.js';

export function normalizeCognitiveCategory(category: string): string {
  if (category.startsWith('logical operator')) return 'logical operators';
  if (category.startsWith('nested ')) return 'nested functions';
  if (category.startsWith('break to') || category.startsWith('continue to')) return 'labeled jumps';
  return category;
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
    description: 'Enable smart extraction suggestions for complex functions (default: true)',
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

/** JSON Schema properties for module-level analysis (flat, top-level). */
export const MODULE_SCHEMA_PROPERTIES = {
  moduleComplexity: {
    type: 'integer',
    minimum: 0,
    maximum: 100,
    description:
      'Enable module analysis and set maximum module complexity score (0-100). Omit to disable.',
  },
  maxCyclomaticSum: {
    type: 'integer',
    minimum: 0,
    description: 'Maximum aggregate cyclomatic complexity for the module. Default: 0 (disabled)',
  },
  maxCognitiveSum: {
    type: 'integer',
    minimum: 0,
    description: 'Maximum aggregate cognitive complexity for the module. Default: 0 (disabled)',
  },
} as const;

export interface ParsedModuleOptions {
  enabled: boolean;
  moduleComplexity: number;
  maxCyclomaticSum: number;
  maxCognitiveSum: number;
}

export interface ModuleSchemaOptions {
  moduleComplexity?: number;
  maxCyclomaticSum?: number;
  maxCognitiveSum?: number;
}

export function parseModuleOptions(options?: ModuleSchemaOptions): ParsedModuleOptions {
  if (options?.moduleComplexity === undefined) {
    return {
      enabled: false,
      moduleComplexity: 80,
      maxCyclomaticSum: 0,
      maxCognitiveSum: 0,
    };
  }

  return {
    enabled: true,
    moduleComplexity: options.moduleComplexity,
    maxCyclomaticSum: options.maxCyclomaticSum ?? 0,
    maxCognitiveSum: options.maxCognitiveSum ?? 0,
  };
}

type ExtractionSchemaOptions = Omit<MaxCognitiveOptions, 'max'>;

export interface ParsedExtractionOptions {
  enableExtraction: boolean;
  extractionOptions: ExtractionOptions;
  breakdownOptions: BreakdownOptions;
}

export function parseExtractionOptions(options: ExtractionSchemaOptions): ParsedExtractionOptions {
  return {
    enableExtraction: options.enableExtraction ?? true,
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
