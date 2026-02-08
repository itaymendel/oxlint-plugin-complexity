import { defineRule } from 'oxlint/plugins';
import type {
  Rule,
  Context,
  FunctionNode,
  ComplexityResult,
  VisitorWithHooks,
  ESTreeNode,
  MaxCognitiveOptions,
} from '../types.js';
import { getFunctionName, summarizeComplexity, formatBreakdown } from '../utils.js';
import { createCognitiveVisitor } from '../cognitive/visitor.js';
import {
  normalizeCognitiveCategory,
  warnDeprecated,
  parseExtractionOptions,
  getExtractionOutput,
  EXTRACTION_SCHEMA_PROPERTIES,
} from './shared.js';

const DEFAULT_MAX = 15;

/**
 * Enforce a maximum cognitive complexity for functions.
 * Default threshold: 15
 *
 * For functions that significantly exceed the threshold (>150% of max),
 * provides Smart Extraction Detection suggestions for refactoring.
 *
 * @deprecated Use 'complexity/complexity' instead for better performance.
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
          ...EXTRACTION_SCHEMA_PROPERTIES,
        },
        additionalProperties: false,
      },
    ],
  },

  createOnce(context: Context) {
    let maxComplexity = DEFAULT_MAX;
    let parsed = parseExtractionOptions({});

    return {
      before() {
        warnDeprecated('max-cognitive');

        const options = (context.options[0] ?? {}) as MaxCognitiveOptions;
        maxComplexity = options.max ?? DEFAULT_MAX;
        parsed = parseExtractionOptions(options);
      },

      ...createCognitiveVisitor(context, (result: ComplexityResult, node: ESTreeNode) => {
        if (result.total <= maxComplexity) return;

        const funcNode = node as FunctionNode;
        const functionName = getFunctionName(funcNode, funcNode.parent);
        const summary = summarizeComplexity(result.points, normalizeCognitiveCategory);
        const breakdown = formatBreakdown(result.points, parsed.breakdownOptions);
        const extractionOutput = getExtractionOutput(
          parsed,
          context,
          node,
          result.points,
          result.total,
          maxComplexity
        );

        context.report({
          node,
          message: `Function '${functionName}' has Cognitive Complexity of ${result.total}. Maximum allowed is ${maxComplexity}.${summary}${breakdown}${extractionOutput}`,
        });
      }),
    } as VisitorWithHooks;
  },
});
