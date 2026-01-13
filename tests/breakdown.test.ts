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

    it('shows nesting tip when top offender has nesting >= 3', () => {
      const [, result] = [...results.entries()][0];
      const breakdown = formatBreakdown(result.points);
      expect(breakdown).toContain('↳ Tip: Extract inner loops');
      expect(breakdown).toContain('each extraction removes one nesting level');
    });
  });

  describe('nesting tip threshold', () => {
    it('does NOT show tip when top offender has nesting < 3', () => {
      // nested-if-in-for has max nesting=1, below the threshold of 3
      const fixture = loadFixture(join(fixturesDir, 'js/nested-if-in-for.js'), fixturesDir);
      const results = calculateCognitiveComplexity(fixture.code, 'test.js');
      const [, result] = [...results.entries()][0];
      const breakdown = formatBreakdown(result.points);

      expect(breakdown).not.toContain('↳ Tip:');
    });

    it('does NOT show tip for cyclomatic complexity (no nesting info)', () => {
      // Cyclomatic points don't have nesting info, so tip should never appear
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: '+1: for',
        },
        {
          complexity: 1,
          location: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
          message: '+1: if',
        },
      ];
      const breakdown = formatBreakdown(points);

      expect(breakdown).not.toContain('↳ Tip:');
    });

    it('respects custom nestingTipThreshold', () => {
      // Point with nesting=3 (would show tip with default threshold of 3)
      const points = [
        {
          complexity: 4,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: '+4 (incl. 3 for nesting): if',
        },
      ];

      // With threshold=4, nesting=3 should NOT show tip
      const breakdownHighThreshold = formatBreakdown(points, { nestingTipThreshold: 4 });
      expect(breakdownHighThreshold).not.toContain('↳ Tip:');

      // With default threshold (3), nesting=3 should show tip
      const breakdownDefault = formatBreakdown(points);
      expect(breakdownDefault).toContain('↳ Tip:');
    });

    it('disables tip when nestingTipThreshold is 0', () => {
      // Point with high nesting that would normally show tip
      const points = [
        {
          complexity: 5,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: '+5 (incl. 4 for nesting): if',
        },
      ];

      const breakdown = formatBreakdown(points, { nestingTipThreshold: 0 });
      expect(breakdown).not.toContain('↳ Tip:');
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

  describe('else-if chain tip', () => {
    it('shows tip when else-if count meets default threshold (4)', () => {
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: '+1: if',
        },
        {
          complexity: 1,
          location: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 3, column: 0 }, end: { line: 3, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 4, column: 0 }, end: { line: 4, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } },
          message: '+1: else if',
        },
      ];
      const breakdown = formatBreakdown(points);

      expect(breakdown).toContain('Tips:');
      expect(breakdown).toContain('Long else-if chain (4 branches)');
      expect(breakdown).toContain('lookup object or switch statement');
    });

    it('does NOT show tip when else-if count is below threshold', () => {
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: '+1: if',
        },
        {
          complexity: 1,
          location: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 3, column: 0 }, end: { line: 3, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 4, column: 0 }, end: { line: 4, column: 10 } },
          message: '+1: else if',
        },
      ];
      const breakdown = formatBreakdown(points);

      expect(breakdown).not.toContain('Tips:');
      expect(breakdown).not.toContain('else-if chain');
    });

    it('respects custom elseIfChainThreshold', () => {
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: '+1: if',
        },
        {
          complexity: 1,
          location: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 3, column: 0 }, end: { line: 3, column: 10 } },
          message: '+1: else if',
        },
      ];

      // With threshold=2, should show tip
      const breakdownLowThreshold = formatBreakdown(points, { elseIfChainThreshold: 2 });
      expect(breakdownLowThreshold).toContain('else-if chain');

      // With default threshold (4), should NOT show tip
      const breakdownDefault = formatBreakdown(points);
      expect(breakdownDefault).not.toContain('else-if chain');
    });

    it('disables tip when elseIfChainThreshold is 0', () => {
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: '+1: if',
        },
        {
          complexity: 1,
          location: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 3, column: 0 }, end: { line: 3, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 4, column: 0 }, end: { line: 4, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } },
          message: '+1: else if',
        },
      ];
      const breakdown = formatBreakdown(points, { elseIfChainThreshold: 0 });

      expect(breakdown).not.toContain('else-if chain');
    });
  });

  describe('logical operator tip', () => {
    it('shows tip when logical operator count meets default threshold (3)', () => {
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: "+1: logical operator '&&'",
        },
        {
          complexity: 1,
          location: { start: { line: 1, column: 10 }, end: { line: 1, column: 20 } },
          message: "+1: logical operator '||'",
        },
        {
          complexity: 1,
          location: { start: { line: 1, column: 20 }, end: { line: 1, column: 30 } },
          message: "+1: logical operator '&&'",
        },
      ];
      const breakdown = formatBreakdown(points);

      expect(breakdown).toContain('Tips:');
      expect(breakdown).toContain('Complex boolean logic (3 operator sequences)');
      expect(breakdown).toContain('named boolean variables');
    });

    it('does NOT show tip when logical operator count is below threshold', () => {
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: "+1: logical operator '&&'",
        },
        {
          complexity: 1,
          location: { start: { line: 1, column: 10 }, end: { line: 1, column: 20 } },
          message: "+1: logical operator '||'",
        },
      ];
      const breakdown = formatBreakdown(points);

      expect(breakdown).not.toContain('Tips:');
      expect(breakdown).not.toContain('boolean logic');
    });

    it('respects custom logicalOperatorThreshold', () => {
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: "+1: logical operator '&&'",
        },
        {
          complexity: 1,
          location: { start: { line: 1, column: 10 }, end: { line: 1, column: 20 } },
          message: "+1: logical operator '||'",
        },
      ];

      // With threshold=2, should show tip
      const breakdownLowThreshold = formatBreakdown(points, { logicalOperatorThreshold: 2 });
      expect(breakdownLowThreshold).toContain('boolean logic');

      // With default threshold (3), should NOT show tip
      const breakdownDefault = formatBreakdown(points);
      expect(breakdownDefault).not.toContain('boolean logic');
    });

    it('disables tip when logicalOperatorThreshold is 0', () => {
      const points = [
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: "+1: logical operator '&&'",
        },
        {
          complexity: 1,
          location: { start: { line: 1, column: 10 }, end: { line: 1, column: 20 } },
          message: "+1: logical operator '||'",
        },
        {
          complexity: 1,
          location: { start: { line: 1, column: 20 }, end: { line: 1, column: 30 } },
          message: "+1: logical operator '&&'",
        },
      ];
      const breakdown = formatBreakdown(points, { logicalOperatorThreshold: 0 });

      expect(breakdown).not.toContain('boolean logic');
    });
  });

  describe('multiple pattern tips', () => {
    it('shows both tips when both patterns are detected', () => {
      const points = [
        // else-if chain (4 branches)
        {
          complexity: 1,
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 3, column: 0 }, end: { line: 3, column: 10 } },
          message: '+1: else if',
        },
        {
          complexity: 1,
          location: { start: { line: 4, column: 0 }, end: { line: 4, column: 10 } },
          message: '+1: else if',
        },
        // logical operators (3 sequences)
        {
          complexity: 1,
          location: { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } },
          message: "+1: logical operator '&&'",
        },
        {
          complexity: 1,
          location: { start: { line: 5, column: 10 }, end: { line: 5, column: 20 } },
          message: "+1: logical operator '||'",
        },
        {
          complexity: 1,
          location: { start: { line: 5, column: 20 }, end: { line: 5, column: 30 } },
          message: "+1: logical operator '&&'",
        },
      ];
      const breakdown = formatBreakdown(points);

      expect(breakdown).toContain('Tips:');
      expect(breakdown).toContain('else-if chain');
      expect(breakdown).toContain('boolean logic');
    });
  });
});
