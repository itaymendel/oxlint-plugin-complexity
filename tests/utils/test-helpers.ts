import { parseSync } from 'oxc-parser';
import { walk } from 'estree-walker';
import type { Node as EstreeWalkerNode } from 'estree-walker';
import { createCyclomaticVisitor } from '#src/cyclomatic.js';
import { createCognitiveVisitor } from '#src/cognitive/visitor.js';
import {
  createCombinedComplexityVisitor,
  type CombinedComplexityResult,
} from '#src/combined-visitor.js';
import { getFunctionName as getProductionFunctionName } from '#src/utils.js';
import { createLineOffsetTable, offsetToLineCol, walkAndDispatch } from '#src/standalone.js';
import type { ESTreeNode, FunctionNode, ComplexityResult, Context } from '#src/types.js';
import type { ScopeManager } from 'oxlint/plugins';
import { analyzeScope } from './test-scope-analyzer.js';

/**
 * Result of complexity calculation for a single function.
 * Extends the production ComplexityResult with a function name.
 */
export interface ComplexityFunctionResult extends ComplexityResult {
  name: string;
}

// Re-export for tests that import directly from test-helpers
export { createLineOffsetTable, offsetToLineCol };

/**
 * Add parent references and loc objects to all AST nodes.
 * Must be called before scope analysis.
 */
function prepareAstForAnalysis(ast: ESTreeNode, code: string): void {
  const lineOffsets = createLineOffsetTable(code);

  walk(ast as EstreeWalkerNode, {
    enter(node, parent) {
      const esNode = node as unknown as ESTreeNode;
      const nodeWithOffsets = node as unknown as { start?: number; end?: number };

      // Convert byte offsets to loc
      if (typeof nodeWithOffsets.start === 'number' && typeof nodeWithOffsets.end === 'number') {
        const startLoc = offsetToLineCol(nodeWithOffsets.start, lineOffsets);
        const endLoc = offsetToLineCol(nodeWithOffsets.end, lineOffsets);
        Object.defineProperty(esNode, 'loc', {
          value: { start: startLoc, end: endLoc },
          writable: true,
          enumerable: false,
          configurable: true,
        });
      }

      // Set parent reference
      Object.defineProperty(esNode, 'parent', {
        value: parent as unknown as ESTreeNode,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    },
  });
}

/**
 * Create a mock oxlint Context for testing.
 *
 * If an AST is provided, scope analysis will be performed using a custom
 * scope analyzer designed for oxc-parser's AST format.
 */
export function createMockContext(ast?: ESTreeNode): Context {
  const scopeManager: ScopeManager | null = ast ? analyzeScope(ast) : null;

  return {
    sourceCode: {
      text: '',
      getText: () => '',
      scopeManager,
      getScope: (node: ESTreeNode) => scopeManager?.acquire(node) ?? null,
    },
    options: [],
    report: () => {},
  } as unknown as Context;
}

function getFunctionName(node: ESTreeNode, index: number): string {
  const funcNode = node as ESTreeNode & { parent?: ESTreeNode };
  const name = getProductionFunctionName(funcNode as FunctionNode, funcNode.parent);

  // Replace production anonymous placeholders with indexed names for clearer test output
  if (name === '<arrow>' || name === '<anonymous>') {
    return `anonymous_${index + 1}`;
  }

  return name;
}

/**
 * Walk an AST using estree-walker and call visitor handlers.
 * Delegates to the production walkAndDispatch from standalone.ts.
 */
export function walkWithVisitor(
  ast: ESTreeNode,
  visitor: Record<string, ((node: ESTreeNode) => void) | undefined>,
  code?: string
): void {
  if (!code) {
    throw new Error('walkWithVisitor requires code for offset-to-loc conversion');
  }
  walkAndDispatch(ast, code, visitor);
}

/**
 * Parse code and prepare AST with parent refs and loc for scope analysis.
 */
export function parseAndPrepareAst(
  code: string,
  filename: string
): { program: ESTreeNode; errors: Array<{ message: string }> } {
  const { program, errors } = parseSync(filename, code);

  if (errors.length === 0) {
    prepareAstForAnalysis(program as unknown as ESTreeNode, code);
  }

  return {
    program: program as unknown as ESTreeNode,
    errors: errors as Array<{ message: string }>,
  };
}

/**
 * Generic complexity calculator that works with any visitor factory.
 */
function calculateComplexityWithVisitor(
  code: string,
  filename: string,
  type: 'cyclomatic' | 'cognitive'
): Map<string, ComplexityFunctionResult> {
  const { program, errors } = parseSync(filename, code);

  if (errors.length > 0) {
    throw new Error(`Parse errors in "${filename}": ${errors.map((e) => e.message).join(', ')}`);
  }

  const results = new Map<string, ComplexityFunctionResult>();
  let functionIndex = 0;

  const onComplexityCalculated = (result: ComplexityResult, node: ESTreeNode) => {
    const name = getFunctionName(node, functionIndex++);
    results.set(name, {
      name,
      ...result,
    });
  };

  // Cyclomatic visitor doesn't need context, cognitive still does
  const listener =
    type === 'cyclomatic'
      ? createCyclomaticVisitor(onComplexityCalculated)
      : createCognitiveVisitor(createMockContext(), onComplexityCalculated);

  // Pass code to walkWithVisitor so it can convert byte offsets to line/column
  walkWithVisitor(program as unknown as ESTreeNode, listener, code);

  return results;
}

/**
 * Calculate cyclomatic complexity for all functions in the given code
 */
export function calculateCyclomaticComplexity(
  code: string,
  filename = 'test.ts'
): Map<string, ComplexityFunctionResult> {
  return calculateComplexityWithVisitor(code, filename, 'cyclomatic');
}

/**
 * Calculate cognitive complexity for all functions in the given code
 */
export function calculateCognitiveComplexity(
  code: string,
  filename = 'test.ts'
): Map<string, ComplexityFunctionResult> {
  return calculateComplexityWithVisitor(code, filename, 'cognitive');
}

/**
 * Calculate both cyclomatic and cognitive complexity.
 */
export function calculateComplexity(
  code: string,
  filename = 'test.ts'
): {
  cyclomatic: Map<string, ComplexityFunctionResult>;
  cognitive: Map<string, ComplexityFunctionResult>;
} {
  return {
    cyclomatic: calculateCyclomaticComplexity(code, filename),
    cognitive: calculateCognitiveComplexity(code, filename),
  };
}

/**
 * Calculate both cyclomatic and cognitive complexity using the combined visitor.
 * This should produce identical results to running them separately.
 */
export function calculateCombinedComplexity(
  code: string,
  filename = 'test.ts'
): {
  cyclomatic: Map<string, ComplexityFunctionResult>;
  cognitive: Map<string, ComplexityFunctionResult>;
} {
  const { program, errors } = parseSync(filename, code);

  if (errors.length > 0) {
    throw new Error(`Parse errors in "${filename}": ${errors.map((e) => e.message).join(', ')}`);
  }

  const cyclomaticResults = new Map<string, ComplexityFunctionResult>();
  const cognitiveResults = new Map<string, ComplexityFunctionResult>();
  let functionIndex = 0;

  const onComplexityCalculated = (result: CombinedComplexityResult, node: ESTreeNode) => {
    const name = getFunctionName(node, functionIndex++);

    cyclomaticResults.set(name, {
      name,
      total: result.cyclomatic,
      points: result.cyclomaticPoints,
    });

    cognitiveResults.set(name, {
      name,
      total: result.cognitive,
      points: result.cognitivePoints,
    });
  };

  const listener = createCombinedComplexityVisitor(createMockContext(), onComplexityCalculated);
  walkWithVisitor(program as unknown as ESTreeNode, listener, code);

  return {
    cyclomatic: cyclomaticResults,
    cognitive: cognitiveResults,
  };
}
