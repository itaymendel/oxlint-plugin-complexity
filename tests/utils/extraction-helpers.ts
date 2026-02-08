import type { ESTreeNode, ComplexityResult } from '#src/types.js';
import type {
  VariableInfo,
  ExtractionCandidate,
  VariableFlowAnalysis,
} from '#src/extraction/types.js';
import {
  createCognitiveVisitorWithTracking,
  type ComplexityResultWithVariables,
} from '#src/cognitive/visitor.js';
import { analyzeVariableFlow } from '#src/extraction/flow-analyzer.js';
import { extractConstructFromMessage } from '#src/utils.js';
import { createMockContext, walkWithVisitor, parseAndPrepareAst } from './test-helpers.js';

export interface ExtendedResult extends ComplexityResult {
  functionName: string;
  variables: Map<string, VariableInfo>;
  node: ESTreeNode;
}

/**
 * Calculate cognitive complexity with variable tracking.
 * Uses eslint-scope for scope analysis to match oxlint's behavior in tests.
 */
export function calculateCognitiveWithTracking(
  code: string,
  filename: string
): Map<string, ExtendedResult> {
  const { program, errors } = parseAndPrepareAst(code, filename);
  if (errors.length > 0) {
    throw new Error(`Parse errors: ${errors.map((e) => e.message).join(', ')}`);
  }

  const results = new Map<string, ExtendedResult>();

  // Create context with scope analysis enabled
  const context = createMockContext(program);

  const listener = createCognitiveVisitorWithTracking(
    context,
    (result: ComplexityResultWithVariables, node: ESTreeNode) => {
      results.set(result.functionName, {
        total: result.total,
        points: result.points,
        functionName: result.functionName,
        variables: result.variables,
        node,
      });
    }
  );

  walkWithVisitor(program, listener, code);
  return results;
}

export function buildCandidateFromResult(result: ExtendedResult): ExtractionCandidate {
  return {
    startLine: result.node.loc!.start.line,
    endLine: result.node.loc!.end.line,
    complexity: result.total,
    complexityPercentage: 50,
    points: result.points,
    constructs: result.points.map((p) => extractConstructFromMessage(p.message)),
  };
}

/**
 * Build an ExtractionCandidate for a specific range within a function.
 * @param result - The extended analysis result containing the function node and complexity data
 * @param startOffset - Offset from function start line (e.g., 2 to skip first 2 lines)
 * @param endOffset - Offset from function end line (e.g., -1 to exclude last line)
 */
export function buildCandidateForRange(
  result: ExtendedResult,
  startOffset: number,
  endOffset: number
): ExtractionCandidate {
  const funcStart = result.node.loc!.start.line;
  const funcEnd = result.node.loc!.end.line;

  return {
    startLine: funcStart + startOffset,
    endLine: funcEnd + endOffset,
    complexity: result.total,
    complexityPercentage: 50,
    points: result.points,
    constructs: result.points.map((p) => extractConstructFromMessage(p.message)),
  };
}

export function analyzeFlowFromResult(result: ExtendedResult): VariableFlowAnalysis {
  const candidate = buildCandidateFromResult(result);
  return analyzeVariableFlow(candidate, result.variables, result.node);
}
