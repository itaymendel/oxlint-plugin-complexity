import { parseSync } from 'oxc-parser';
import { walk } from 'estree-walker';
import type { Node as EstreeWalkerNode } from 'estree-walker';
import type { Context, ESTreeNode } from './types.js';
import {
  createModuleAnalysisVisitor,
  type ModuleAnalysisResult,
  type ModuleComplexityOptions,
} from './module/visitor.js';

function createLineOffsetTable(code: string): number[] {
  const lineOffsets: number[] = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') {
      lineOffsets.push(i + 1);
    }
  }
  return lineOffsets;
}

function offsetToLineCol(offset: number, lineOffsets: number[]): { line: number; column: number } {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineOffsets[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineOffsets[lo] };
}

type VisitorHandlerMap = Record<string, ((node: ESTreeNode) => void) | undefined>;

/** Single-pass AST walk: adds parent/loc references and dispatches visitor handlers. */
function walkAndDispatch(ast: ESTreeNode, code: string, visitor: VisitorHandlerMap): void {
  const lineOffsets = createLineOffsetTable(code);

  walk(ast as EstreeWalkerNode, {
    enter(node, parent) {
      const esNode = node as unknown as ESTreeNode;
      const raw = node as unknown as { start?: number; end?: number };

      if (typeof raw.start === 'number' && typeof raw.end === 'number') {
        Object.defineProperty(esNode, 'loc', {
          value: {
            start: offsetToLineCol(raw.start, lineOffsets),
            end: offsetToLineCol(raw.end, lineOffsets),
          },
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

function createLibraryContext(): Context {
  return {
    sourceCode: {
      text: '',
      getText: () => '',
      scopeManager: null,
      getScope: () => null,
    },
    options: [],
    report: () => {},
  } as unknown as Context;
}

/** Standalone module complexity analysis (no linting context required). */
export function analyzeModule(
  code: string,
  filename: string = 'module.js',
  options?: ModuleComplexityOptions
): ModuleAnalysisResult {
  const { program, errors } = parseSync(filename, code);

  if (errors.length > 0) {
    throw new Error(
      `Parse errors in "${filename}": ${errors.map((e: { message: string }) => e.message).join(', ')}`
    );
  }

  const ast = program as unknown as ESTreeNode;
  let result: ModuleAnalysisResult | undefined;

  const visitor = createModuleAnalysisVisitor(
    createLibraryContext(),
    (r) => {
      result = r;
    },
    undefined,
    options
  );

  walkAndDispatch(ast, code, visitor as VisitorHandlerMap);

  if (!result) {
    throw new Error('Module analysis did not produce a result');
  }

  return result;
}
