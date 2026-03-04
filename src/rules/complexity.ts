import { defineRule } from '@oxlint/plugins';
import type {
  Rule,
  Context,
  FunctionNode,
  MaxCognitiveOptions,
  VisitorWithHooks,
  ESTreeNode,
} from '../types.js';
import { getFunctionName, summarizeComplexity, formatBreakdown } from '../utils.js';
import type { CombinedComplexityResult } from '../combined-visitor.js';
import { createModuleAnalysisVisitor, type ModuleAnalysisResult } from '../module/visitor.js';
import {
  normalizeCognitiveCategory,
  parseExtractionOptions,
  getExtractionOutput,
  EXTRACTION_SCHEMA_PROPERTIES,
  MODULE_SCHEMA_PROPERTIES,
  parseModuleOptions,
  type ParsedModuleOptions,
  type ParsedExtractionOptions,
  type ModuleSchemaOptions,
} from './shared.js';

const DEFAULT_CYCLOMATIC = 20;
const DEFAULT_COGNITIVE = 15;
const DEFAULT_MIN_LINES = 10;

interface CombinedComplexityOptions extends Omit<MaxCognitiveOptions, 'max'>, ModuleSchemaOptions {
  cyclomatic?: number;
  cognitive?: number;
  minLines?: number;
}

const CONTRIBUTOR_MESSAGES: Record<string, string> = {
  effort: 'Main contributor: complex expressions increase bug risk.',
  cyclomatic: 'Main contributor: too many decision branches.',
  loc: 'Main contributor: functions are too long.',
};

function buildComplexityScoreMessages(
  result: ModuleAnalysisResult,
  opts: ParsedModuleOptions
): string[] {
  if (opts.moduleComplexity <= 0 || result.moduleComplexity <= opts.moduleComplexity) return [];

  const messages = [
    `Module is too complex (score: ${result.moduleComplexity.toFixed(1)}/100, maximum: ${opts.moduleComplexity}).`,
  ];

  if (result.halstead.bugs >= 0.1) {
    messages.push(`Estimated bug risk: ~${result.halstead.bugs.toFixed(1)} defects.`);
  }

  const readingMinutes = result.halstead.time / 60;
  if (readingMinutes >= 1) {
    messages.push(`Estimated reading time: ~${Math.round(readingMinutes)} min.`);
  }

  messages.push(CONTRIBUTOR_MESSAGES[result.complexityDecomposition.mainContributor]);

  return messages;
}

function buildAggregateMessages(result: ModuleAnalysisResult, opts: ParsedModuleOptions): string[] {
  const messages: string[] = [];

  if (opts.maxCyclomaticSum > 0 && result.cyclomatic.sum > opts.maxCyclomaticSum) {
    messages.push(
      `Module has too many decision paths (total: ${result.cyclomatic.sum}, maximum: ${opts.maxCyclomaticSum}).`
    );
  }

  if (opts.maxCognitiveSum > 0 && result.cognitive.sum > opts.maxCognitiveSum) {
    messages.push(
      `Module is too hard to read (cognitive total: ${result.cognitive.sum}, maximum: ${opts.maxCognitiveSum}).`
    );
  }

  return messages;
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
 *
 * When `moduleComplexity` is present, also performs module-level analysis:
 * - Halstead metrics
 * - Module complexity score (inverted Maintainability Index)
 * - Aggregate complexity scores
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
          ...MODULE_SCHEMA_PROPERTIES,
          ...EXTRACTION_SCHEMA_PROPERTIES,
        },
        additionalProperties: false,
      },
    ],
  },

  createOnce(context: Context) {
    // Options are read in before() — these are mutable defaults
    let maxCyclomatic = DEFAULT_CYCLOMATIC;
    let maxCognitive = DEFAULT_COGNITIVE;
    let minLines = DEFAULT_MIN_LINES;
    let parsed: ParsedExtractionOptions = parseExtractionOptions({});
    let moduleOpts: ParsedModuleOptions = parseModuleOptions();

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

    function reportModule(result: ModuleAnalysisResult): void {
      if (!moduleOpts.enabled) return;

      const messages = [
        ...buildComplexityScoreMessages(result, moduleOpts),
        ...buildAggregateMessages(result, moduleOpts),
      ];

      if (messages.length === 0) return;

      context.report({
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        message: messages.join(' '),
      });
    }

    return {
      before() {
        const options = (context.options[0] ?? {}) as CombinedComplexityOptions;
        maxCyclomatic = options.cyclomatic ?? DEFAULT_CYCLOMATIC;
        maxCognitive = options.cognitive ?? DEFAULT_COGNITIVE;
        minLines = options.minLines ?? DEFAULT_MIN_LINES;
        parsed = parseExtractionOptions(options);
        moduleOpts = parseModuleOptions(options);
      },

      // Always use the module analysis visitor — it's a superset of the combined visitor.
      // When module analysis is disabled, reportModule() is a no-op, so the only overhead
      // is Halstead counting. This avoids the need to conditionally create visitors.
      ...createModuleAnalysisVisitor(context, reportModule, handleComplexityResult),
    } as VisitorWithHooks;
  },
});
