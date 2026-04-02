import { readFileSync } from 'node:fs';
import { analyzeFileComplexity, type FunctionComplexityResult } from './standalone.js';
import { parseDiff, type DiffFile } from './diff-parser.js';

export interface DiffAnalysisOptions {
  /** Which changes to analyze: additions (default), deletions, or both */
  include?: 'additions' | 'deletions' | 'both';
  /** Custom file reader. Defaults to fs.readFileSync(path, 'utf-8') */
  readFile?: (path: string) => string;
}

export interface DiffFileResult {
  path: string;
  changedLines: number[];
  functions: FunctionComplexityResult[];
}

export interface DiffAnalysisResult {
  files: DiffFileResult[];
}

function getChangedLines(
  addedLines: number[],
  deletedLines: number[],
  include: 'additions' | 'deletions' | 'both'
): number[] {
  switch (include) {
    case 'additions':
      return addedLines;
    case 'deletions':
      return deletedLines;
    case 'both':
      return [...addedLines, ...deletedLines];
  }
}

function hasOverlap(startLine: number, endLine: number, lines: Set<number>): boolean {
  for (let line = startLine; line <= endLine; line++) {
    if (lines.has(line)) return true;
  }
  return false;
}

function analyzeChangedFile(
  diffFile: DiffFile,
  include: 'additions' | 'deletions' | 'both',
  readFile: (path: string) => string
): DiffFileResult | null {
  const path = diffFile.newPath ?? diffFile.oldPath;
  if (!path) return null;

  if (include !== 'both' && !diffFile.newPath) return null;

  const changedLines = getChangedLines(diffFile.addedLines, diffFile.deletedLines, include);
  if (changedLines.length === 0) return null;

  const changedLineSet = new Set(changedLines);

  let source: string;
  try {
    source = readFile(path);
  } catch {
    return null;
  }

  const analysis = analyzeFileComplexity(source, path);
  const touchedFunctions = analysis.functions.filter((fn) =>
    hasOverlap(fn.startLine, fn.endLine, changedLineSet)
  );

  if (touchedFunctions.length === 0) return null;
  return { path, changedLines, functions: touchedFunctions };
}

/**
 * Analyze complexity of functions touched by a unified diff.
 *
 * Parses the diff, reads each changed file, runs complexity analysis,
 * and returns results filtered to only functions whose line range
 * overlaps with the changed lines.
 *
 * @param diff - Unified diff string (e.g. output of `git diff`)
 * @param options - Analysis options
 */
export function analyzeDiffComplexity(
  diff: string,
  options?: DiffAnalysisOptions
): DiffAnalysisResult {
  const include = options?.include ?? 'additions';
  const readFile = options?.readFile ?? ((path: string) => readFileSync(path, 'utf-8'));

  const diffFiles = parseDiff(diff);
  const results: DiffFileResult[] = [];

  for (const diffFile of diffFiles) {
    const result = analyzeChangedFile(diffFile, include, readFile);
    if (result) results.push(result);
  }

  return { files: results };
}
