import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ESTreeNode, FunctionNode } from '#src/types.js';
import { createCombinedComplexityVisitor } from '#src/combined-visitor.js';
import {
  analyzeExtractionOpportunities,
  formatExtractionSuggestions,
} from '#src/extraction/index.js';
import { getVariablesForFunction } from '#src/extraction/variable-tracker.js';
import { getFunctionName } from '#src/utils.js';
import { loadFixturesFromDir, getParseFilename } from './utils/fixture-loader.js';
import { createMockContext, parseAndPrepareAst, walkWithVisitor } from './utils/test-helpers.js';
import { analyze } from './utils/real-scopes.js';

/**
 * Known places where the hand-written mock scope analyzer and oxlint's real scope manager give
 * different output. The real one is authoritative. Each entry states exactly what is expected, so
 * a new divergence fails, and a plugin fix is accepted only in the form the entry names.
 * - extraction-candidate.js: real scopes list `totalCount` (read and mutated in the block) as an
 *   input; the mock omits it. A mock limitation, so the difference must remain.
 */
const KNOWN_DIFFERENCES: Record<string, (real: string, mock: string | undefined) => void> = {
  'js/extraction-candidate.js processOrder@3-43': (real, mock) => {
    expect(real).toContain('Inputs: config, totalCount, processedItems');
    expect(mock).not.toContain('Inputs: config, totalCount');
  },
};

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** The same analysis as the harness, but with the hand-written mock scope analyzer. */
function analyzeWithMockScopes(code: string, filename: string) {
  const { program, errors } = parseAndPrepareAst(code, filename);
  if (errors.length > 0) throw new Error(errors.map((e) => e.message).join(', '));
  const context = createMockContext(program);
  const out: Array<{ name: string; start: number; end: number; text: string }> = [];
  const visitor = createCombinedComplexityVisitor(context, (result, node: ESTreeNode) => {
    const fn = node as FunctionNode;
    const suggestions = analyzeExtractionOpportunities(
      node,
      result.cognitivePoints,
      result.cognitive,
      getVariablesForFunction(context, node),
      { filename }
    );
    out.push({
      name: getFunctionName(fn, fn.parent),
      start: node.loc!.start.line,
      end: node.loc!.end.line,
      text: formatExtractionSuggestions(suggestions),
    });
  });
  walkWithVisitor(program, visitor as Record<string, (n: ESTreeNode) => void>, code);
  return out;
}

function compareFixture(fixture: ReturnType<typeof loadFixturesFromDir>[number]) {
  const filename = getParseFilename(fixture);
  const real = analyze(fixture.code, filename);
  const mock = analyzeWithMockScopes(fixture.code, filename);
  const key = (n: string, s: number, e: number) => `${n}@${s}-${e}`;
  const mockByKey = new Map(mock.map((m) => [key(m.name, m.start, m.end), m.text]));
  const rows = real.map((r) => {
    const k = `${fixture.relativePath} ${key(r.functionName, r.startLine, r.endLine)}`;
    const realText = formatExtractionSuggestions(r.suggestions);
    const mockText = mockByKey.get(key(r.functionName, r.startLine, r.endLine));
    return { key: k, realText, mockText, hasSuggestions: r.suggestions.length > 0 };
  });
  return { realCount: real.length, mockCount: mock.length, rows };
}

describe('scope harness on existing fixtures', () => {
  const fixtures = loadFixturesFromDir(fixturesDir);

  it('loads fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(50);
  });

  for (const fixture of fixtures) {
    it(`${fixture.relativePath} runs without errors`, () => {
      const { realCount, mockCount } = compareFixture(fixture);
      expect(realCount).toBe(mockCount);
    });
  }

  // Self-contained: does not depend on the per-fixture tests above.
  it('mock and real scope results differ only where known', () => {
    const rows = fixtures.flatMap((f) => compareFixture(f).rows);
    expect(rows.filter((r) => r.hasSuggestions).length).toBeGreaterThan(20);

    const unexpected = rows.filter(
      (r) => r.realText !== r.mockText && !(r.key in KNOWN_DIFFERENCES)
    );
    expect(
      unexpected.map((r) => `${r.key}\n  real: ${r.realText}\n  mock: ${r.mockText}`),
      'unexpected differences between mock and real scopes'
    ).toEqual([]);

    for (const [key, check] of Object.entries(KNOWN_DIFFERENCES)) {
      const row = rows.find((r) => r.key === key);
      expect(row, `known fixture function ${key} no longer exists`).toBeDefined();
      check(row!.realText, row!.mockText);
    }
  });
});
