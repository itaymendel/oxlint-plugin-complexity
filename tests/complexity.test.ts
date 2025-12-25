import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadFixturesFromDir, getParseFilename } from './utils/fixture-loader';
import {
  calculateCyclomaticComplexity,
  calculateCognitiveComplexity,
  type ComplexityFunctionResult,
} from './utils/test-helpers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

/**
 * Create a test suite for a complexity metric.
 * Runs all fixtures against the specified complexity calculator.
 */
function createComplexityTestSuite(
  metricName: 'cyclomatic' | 'cognitive',
  calculator: (code: string, filename: string) => Map<string, ComplexityFunctionResult>
): void {
  const titleCase = metricName.charAt(0).toUpperCase() + metricName.slice(1);

  describe(`${titleCase} Complexity`, () => {
    const fixtures = loadFixturesFromDir(fixturesDir);

    describe.each(fixtures)('$relativePath', (fixture) => {
      const parseFilename = getParseFilename(fixture);
      const results = calculator(fixture.code, parseFilename);

      const expectations = fixture.expectations.filter((exp) => exp[metricName] !== undefined);

      it.each(expectations)(
        `$name should have ${metricName} complexity $${metricName}`,
        (expected) => {
          const actual = results.get(expected.name);

          if (actual === undefined) {
            const availableFunctions = Array.from(results.keys()).join(', ');
            throw new Error(
              `Function "${expected.name}" not found in fixture. ` +
                `Available functions: ${availableFunctions || '(none)'}`
            );
          }

          expect(actual.total).toBe(expected[metricName]);
        }
      );
    });
  });
}

// Run both test suites
createComplexityTestSuite('cyclomatic', calculateCyclomaticComplexity);
createComplexityTestSuite('cognitive', calculateCognitiveComplexity);
