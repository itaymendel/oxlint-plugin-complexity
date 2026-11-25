import { RuleTester } from 'oxlint/plugins-dev';
import { defineRule } from '@oxlint/plugins';
import type { Context, ESTreeNode, FunctionNode } from '#src/types.js';
import {
  createCombinedComplexityVisitor,
  type CombinedComplexityResult,
} from '#src/combined-visitor.js';
import { analyzeExtractionOpportunities } from '#src/extraction/index.js';
import type { ExtractionOptions, ExtractionSuggestion } from '#src/extraction/types.js';
import { getVariablesForFunction } from '#src/extraction/variable-tracker.js';
import { getFunctionName } from '#src/utils.js';

export type SourceType = 'module' | 'script';

/** Extraction results for one function. */
interface FunctionSuggestions {
  functionName: string;
  startLine: number;
  endLine: number;
  suggestions: ExtractionSuggestion[];
}

/** Thresholds under which small blocks become candidates. */
export const PERMISSIVE_OPTIONS = { minComplexityPercentage: 5, maxCandidates: 8 };

// RuleTester normally registers tests with a framework; run them inline instead so that any
// exception thrown inside the rule surfaces directly to the caller.
RuleTester.describe = (_name: string, fn: () => void): void => fn();
RuleTester.it = (_name: string, fn: () => void): void => fn();

/**
 * Calls `visit` for each function (nested ones included, innermost first) inside oxlint's own
 * RuleTester runtime, so scopes come from oxlint's real scope manager. The language comes from the
 * filename extension.
 */
export function visitFunctions(
  code: string,
  filename: string,
  sourceType: SourceType,
  visit: (context: Context, result: CombinedComplexityResult, node: ESTreeNode) => void
): void {
  const failures: unknown[] = [];
  const rule = defineRule({
    meta: { type: 'suggestion', schema: [] },
    create: (context: Context) =>
      createCombinedComplexityVisitor(context, (result, node: ESTreeNode) => {
        try {
          visit(context, result, node);
        } catch (error) {
          failures.push(error);
        }
      }),
  });
  new RuleTester().run('harness', rule, {
    valid: [{ code, filename, languageOptions: { sourceType } }],
    invalid: [],
  });
  if (failures.length > 0) throw failures[0];
}

/**
 * Mirrors the production `complexity` rule, except for its threshold gates (cognitive > max,
 * total > max * multiplier, minLines).
 */
export function analyze(
  code: string,
  filename: string,
  options: ExtractionOptions = {},
  sourceType: SourceType = 'module'
): FunctionSuggestions[] {
  const results: FunctionSuggestions[] = [];
  visitFunctions(code, filename, sourceType, (context, result, node) => {
    const fn = node as FunctionNode;
    results.push({
      functionName: getFunctionName(fn, fn.parent),
      startLine: node.loc!.start.line,
      endLine: node.loc!.end.line,
      suggestions: analyzeExtractionOpportunities(
        node,
        result.cognitivePoints,
        result.cognitive,
        () => getVariablesForFunction(context, node),
        { ...options, filename: context.filename }
      ),
    });
  });
  // Functions finish innermost-first; report in source order.
  return results.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
}

export function suggestionsOf(...args: Parameters<typeof analyze>): ExtractionSuggestion[] {
  return analyze(...args).flatMap((fn) => fn.suggestions);
}
