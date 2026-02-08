import { defineRule } from 'oxlint/plugins';
import type {
  Rule,
  Context,
  FunctionNode,
  MaxCognitiveOptions,
  VisitorWithHooks,
  ESTreeNode,
} from '../types.js';
import { getFunctionName, summarizeComplexity, formatBreakdown } from '../utils.js';
import {
  createCombinedComplexityVisitor,
  type CombinedComplexityResult,
} from '../combined-visitor.js';
import {
  normalizeCognitiveCategory,
  parseExtractionOptions,
  getExtractionOutput,
  EXTRACTION_SCHEMA_PROPERTIES,
} from './shared.js';

const DEFAULT_CYCLOMATIC = 20;
const DEFAULT_COGNITIVE = 15;

interface CombinedComplexityOptions extends Omit<MaxCognitiveOptions, 'max'> {
  cyclomatic?: number;
  cognitive?: number;
}

/**
 * Enforce maximum cyclomatic and cognitive complexity (RECOMMENDED).
 *
 * This rule combines both complexity checks in a single AST walk,
 * providing better performance than using separate rules.
 *
 * Default thresholds:
 * - Cyclomatic: 20
 * - Cognitive: 15
 */
export const complexity: Rule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce maximum cyclomatic and cognitive complexity',
      recommended: true,
      url: 'https://github.com/itaymendel/oxlint-plugin-complexity#complexitycomplexity',
    },
    schema: [
      {
        type: 'object',
        properties: {
          cyclomatic: {
            type: 'integer',
            minimum: 1,
            description: 'Maximum cyclomatic complexity (default: 20)',
          },
          cognitive: {
            type: 'integer',
            minimum: 0,
            description: 'Maximum cognitive complexity (default: 15)',
          },
          ...EXTRACTION_SCHEMA_PROPERTIES,
        },
        additionalProperties: false,
      },
    ],
  },

  createOnce(context: Context) {
    let maxCyclomatic = DEFAULT_CYCLOMATIC;
    let maxCognitive = DEFAULT_COGNITIVE;
    let parsed = parseExtractionOptions({});

    return {
      before() {
        const options = (context.options[0] ?? {}) as CombinedComplexityOptions;
        maxCyclomatic = options.cyclomatic ?? DEFAULT_CYCLOMATIC;
        maxCognitive = options.cognitive ?? DEFAULT_COGNITIVE;
        parsed = parseExtractionOptions(options);
      },

      ...createCombinedComplexityVisitor(
        context,
        (result: CombinedComplexityResult, node: ESTreeNode) => {
          const funcNode = node as FunctionNode;
          const functionName = getFunctionName(funcNode, funcNode.parent);

          if (result.cyclomatic > maxCyclomatic) {
            const summary = summarizeComplexity(result.cyclomaticPoints);
            const breakdown = formatBreakdown(result.cyclomaticPoints);

            context.report({
              node,
              message: `Function '${functionName}' has cyclomatic complexity of ${result.cyclomatic}. Maximum allowed is ${maxCyclomatic}.${summary}${breakdown}`,
            });
          }

          if (result.cognitive > maxCognitive) {
            const summary = summarizeComplexity(result.cognitivePoints, normalizeCognitiveCategory);
            const breakdown = formatBreakdown(result.cognitivePoints, parsed.breakdownOptions);
            const extractionOutput = getExtractionOutput(
              parsed,
              context,
              node,
              result.cognitivePoints,
              result.cognitive,
              maxCognitive
            );

            context.report({
              node,
              message: `Function '${functionName}' has Cognitive Complexity of ${result.cognitive}. Maximum allowed is ${maxCognitive}.${summary}${breakdown}${extractionOutput}`,
            });
          }
        }
      ),
    } as VisitorWithHooks;
  },
});
