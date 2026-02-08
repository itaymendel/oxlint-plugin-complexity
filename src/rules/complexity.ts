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
const DEFAULT_MIN_LINES = 10;

interface CombinedComplexityOptions extends Omit<MaxCognitiveOptions, 'max'> {
  cyclomatic?: number;
  cognitive?: number;
  minLines?: number;
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
 * - minLines: 10 (skip functions with fewer lines for better performance)
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
          minLines: {
            type: 'integer',
            minimum: 0,
            description: 'Minimum lines to analyze (default: 10, 0 = analyze all)',
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
    let minLines = DEFAULT_MIN_LINES;
    let parsed = parseExtractionOptions({});

    function isBelowMinLines(node: ESTreeNode): boolean {
      if (minLines <= 0 || !node.loc) return false;
      const functionLines = node.loc.end.line - node.loc.start.line + 1;
      return functionLines < minLines;
    }

    function reportCyclomatic(
      node: ESTreeNode,
      functionName: string,
      result: CombinedComplexityResult
    ): void {
      if (result.cyclomatic <= maxCyclomatic) return;

      const summary = summarizeComplexity(result.cyclomaticPoints);
      const breakdown = formatBreakdown(result.cyclomaticPoints);

      context.report({
        node,
        message: `Function '${functionName}' has cyclomatic complexity of ${result.cyclomatic}. Maximum allowed is ${maxCyclomatic}.${summary}${breakdown}`,
      });
    }

    function reportCognitive(
      node: ESTreeNode,
      functionName: string,
      result: CombinedComplexityResult
    ): void {
      if (result.cognitive <= maxCognitive) return;

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

    function handleComplexityResult(result: CombinedComplexityResult, node: ESTreeNode): void {
      if (isBelowMinLines(node)) return;

      const funcNode = node as FunctionNode;
      const functionName = getFunctionName(funcNode, funcNode.parent);

      reportCyclomatic(node, functionName, result);
      reportCognitive(node, functionName, result);
    }

    return {
      before() {
        const options = (context.options[0] ?? {}) as CombinedComplexityOptions;
        maxCyclomatic = options.cyclomatic ?? DEFAULT_CYCLOMATIC;
        maxCognitive = options.cognitive ?? DEFAULT_COGNITIVE;
        minLines = options.minLines ?? DEFAULT_MIN_LINES;
        parsed = parseExtractionOptions(options);
      },

      ...createCombinedComplexityVisitor(context, handleComplexityResult),
    } as VisitorWithHooks;
  },
});
