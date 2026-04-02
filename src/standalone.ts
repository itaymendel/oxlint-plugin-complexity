import { parseSync } from 'oxc-parser';
import { walk } from 'estree-walker';
import type { Node as EstreeWalkerNode } from 'estree-walker';
import {
  createCombinedComplexityVisitor,
  type CombinedComplexityResult,
} from './combined-visitor.js';
import { getFunctionName } from './utils.js';
import type { ESTreeNode, FunctionNode, ComplexityPoint, Context } from './types.js';

export interface FunctionComplexityResult {
  name: string;
  startLine: number;
  endLine: number;
  cyclomatic: number;
  cognitive: number;
  cyclomaticPoints: ComplexityPoint[];
  cognitivePoints: ComplexityPoint[];
}

export interface FileAnalysisResult {
  filename: string;
  functions: FunctionComplexityResult[];
}

export function createLineOffsetTable(code: string): number[] {
  const lineOffsets: number[] = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') {
      lineOffsets.push(i + 1);
    }
  }
  return lineOffsets;
}

export function offsetToLineCol(
  offset: number,
  lineOffsets: number[]
): { line: number; column: number } {
  for (let i = lineOffsets.length - 1; i >= 0; i--) {
    if (offset >= lineOffsets[i]) {
      return { line: i + 1, column: offset - lineOffsets[i] };
    }
  }
  return { line: 1, column: offset };
}

function createStandaloneContext(code: string): Context {
  return {
    sourceCode: {
      text: code,
      getText: (node: unknown) => {
        const n = node as { start?: number; end?: number } | null | undefined;
        if (n && typeof n.start === 'number' && typeof n.end === 'number') {
          return code.slice(n.start, n.end);
        }
        return '';
      },
      scopeManager: null,
      getScope: () => null,
    },
    options: [],
    report: () => {},
  } as unknown as Context;
}

export function walkAndDispatch(
  ast: ESTreeNode,
  code: string,
  visitor: Record<string, ((node: ESTreeNode) => void) | undefined>
): void {
  const lineOffsets = createLineOffsetTable(code);

  walk(ast as EstreeWalkerNode, {
    enter(node, parent) {
      const esNode = node as unknown as ESTreeNode;
      const nodeWithOffsets = node as unknown as { start?: number; end?: number };

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

      Object.defineProperty(esNode, 'parent', {
        value: parent as unknown as ESTreeNode,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      visitor[esNode.type]?.(esNode);
      visitor['*']?.(esNode);
    },
    leave(node) {
      const esNode = node as unknown as ESTreeNode;
      visitor[`${esNode.type}:exit`]?.(esNode);
      visitor['*:exit']?.(esNode);
    },
  });
}

/**
 * Analyze a source file for function complexity without the oxlint runtime.
 *
 * Parses the code with oxc-parser, runs the combined cyclomatic + cognitive
 * complexity visitor, and returns results for every function in the file.
 */
export function analyzeFileComplexity(code: string, filename: string): FileAnalysisResult {
  const { program, errors } = parseSync(filename, code);

  if (errors.length > 0) {
    throw new Error(`Parse errors in "${filename}": ${errors.map((e) => e.message).join(', ')}`);
  }

  const functions: FunctionComplexityResult[] = [];
  let functionIndex = 0;

  const context = createStandaloneContext(code);

  const onComplexityCalculated = (result: CombinedComplexityResult, node: ESTreeNode) => {
    const funcNode = node as ESTreeNode & { parent?: ESTreeNode };
    const name = getFunctionName(funcNode as FunctionNode, funcNode.parent);
    const displayName =
      name === '<arrow>' || name === '<anonymous>' ? `anonymous_${functionIndex + 1}` : name;
    functionIndex++;

    const loc = node.loc;
    functions.push({
      name: displayName,
      startLine: loc?.start.line ?? 0,
      endLine: loc?.end.line ?? 0,
      cyclomatic: result.cyclomatic,
      cognitive: result.cognitive,
      cyclomaticPoints: result.cyclomaticPoints,
      cognitivePoints: result.cognitivePoints,
    });
  };

  const visitor = createCombinedComplexityVisitor(context, onComplexityCalculated);
  walkAndDispatch(program as unknown as ESTreeNode, code, visitor);

  return { filename, functions };
}
