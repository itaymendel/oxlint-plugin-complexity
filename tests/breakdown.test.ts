import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './utils/fixture-loader';
import { calculateCognitiveComplexity } from './utils/test-helpers';
import { formatBreakdown } from '#src/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('formatBreakdown', () => {
  describe('output format', () => {
    const fixture = loadFixture(join(fixturesDir, 'js/nested-if-in-for.js'), fixturesDir);
    const results = calculateCognitiveComplexity(fixture.code, 'test.js');
    const result = results.get('nestedIfInFor')!;
    const breakdown = formatBreakdown(result.points);

    it('starts with Breakdown header', () => {
      expect(breakdown).toContain('Breakdown:');
    });

    it('shows lines in ascending order', () => {
      const lineNumbers = [...breakdown.matchAll(/Line (\d+):/g)].map((m) => parseInt(m[1], 10));
      const sorted = [...lineNumbers].sort((a, b) => a - b);
      expect(lineNumbers).toEqual(sorted);
    });

    it('marks top offender with >>> prefix and [top offender] suffix', () => {
      expect(breakdown).toMatch(/>>>.+\[top offender\]/);
    });

    it('uses consistent indentation for non-top-offender lines', () => {
      const nonTopLines = breakdown
        .split('\n')
        .filter((l) => l.includes('Line') && !l.includes('>>>'));
      for (const line of nonTopLines) {
        expect(line).toMatch(/^\s{3} Line/);
      }
    });
  });

  describe('with deeply nested fixture', () => {
    const fixture = loadFixture(join(fixturesDir, 'js/deeply-nested.js'), fixturesDir);
    const results = calculateCognitiveComplexity(fixture.code, 'test.js');

    it('shows nesting info when present', () => {
      const [, result] = [...results.entries()][0];
      const breakdown = formatBreakdown(result.points);
      expect(breakdown).toContain('(incl. +');
      expect(breakdown).toContain('nesting)');
    });
  });

  describe('with multiple top offenders (ties)', () => {
    const fixture = loadFixture(join(fixturesDir, 'js/if-else-if-else.js'), fixturesDir);
    const results = calculateCognitiveComplexity(fixture.code, 'test.js');

    it('marks all tied top offenders', () => {
      const [, result] = [...results.entries()][0];
      const breakdown = formatBreakdown(result.points);

      // Count how many points have max complexity
      const maxComplexity = Math.max(...result.points.map((p) => p.complexity));
      const tiedCount = result.points.filter((p) => p.complexity === maxComplexity).length;

      // Should have same number of >>> markers
      const markerCount = (breakdown.match(/>>>/g) || []).length;
      expect(markerCount).toBe(tiedCount);
    });
  });

  describe('empty points', () => {
    it('returns empty string for empty points array', () => {
      expect(formatBreakdown([])).toBe('');
    });
  });
});
