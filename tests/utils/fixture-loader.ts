import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { extractVueScript } from './vue-extractor';
import { parseComplexityComment, type FunctionExpectation } from './complexity-comment';

const FILE_TYPES = ['js', 'ts', 'jsx', 'tsx', 'vue'] as const;
export type FileType = (typeof FILE_TYPES)[number];

/**
 * Get the filename to use for parsing based on fixture type
 */
export function getParseFilename(fixture: { fileType: string; scriptLang?: string }): string {
  if (fixture.fileType === 'vue') {
    return `test.${fixture.scriptLang ?? 'js'}`;
  }
  return `test.${fixture.fileType}`;
}

function getFileType(filePath: string): FileType {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1);
  return FILE_TYPES.includes(ext as FileType) ? (ext as FileType) : 'js';
}

/**
 * Load a single fixture file and extract its code + expected complexity values
 */
export function loadFixture(filePath: string, fixturesRoot: string) {
  const rawContent = readFileSync(filePath, 'utf-8');
  const fileType = getFileType(filePath);

  let code: string;
  let scriptLang: 'ts' | 'js' | undefined;
  let firstLine: string;

  if (fileType === 'vue') {
    const extracted = extractVueScript(rawContent);
    code = extracted.script;
    scriptLang = extracted.lang;
    firstLine = code.split('\n')[0]?.trim() || '';
  } else {
    code = rawContent;
    firstLine = rawContent.split('\n')[0]?.trim() || '';
  }

  if (!firstLine.startsWith('// @complexity')) {
    throw new Error(`Fixture "${filePath}" must start with a @complexity comment`);
  }

  return {
    relativePath: relative(fixturesRoot, filePath),
    filePath,
    code,
    expectations: parseComplexityComment(firstLine),
    fileType,
    scriptLang,
  };
}

/**
 * Load all fixture files from a directory
 */
export function loadFixturesFromDir(dirPath: string, fixturesRoot: string = dirPath) {
  const entries = readdirSync(dirPath, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && FILE_TYPES.some((type) => entry.name.endsWith(`.${type}`)))
    .map((entry) => loadFixture(join(entry.parentPath, entry.name), fixturesRoot))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
