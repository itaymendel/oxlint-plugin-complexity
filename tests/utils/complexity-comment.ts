/**
 * Expected complexity values for a single function
 */
export interface FunctionExpectation {
  name: string;
  cyclomatic?: number;
  cognitive?: number;
}

/**
 * Parse the @complexity comment from a fixture file.
 *
 * Format: // @complexity funcName:cyclomatic=2,cognitive=3 otherFunc:cyclomatic=1
 *
 * @param line - The line containing the @complexity comment
 * @returns Array of function expectations
 * @throws Error if the comment is malformed
 */
export function parseComplexityComment(line: string): FunctionExpectation[] {
  const match = line.match(/^\/\/\s*@complexity\s+(.+)$/);
  if (!match) {
    throw new Error(
      `Invalid @complexity comment format. Expected: // @complexity funcName:cyclomatic=2,cognitive=3`
    );
  }

  const content = match[1].trim();
  const expectations: FunctionExpectation[] = [];

  for (const part of content.split(/\s+/)) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        `Invalid function expectation: "${part}". Expected: funcName:cyclomatic=2,cognitive=3`
      );
    }

    const name = part.slice(0, colonIndex);
    const metricsStr = part.slice(colonIndex + 1);

    if (!name) {
      throw new Error(`Empty function name in: "${part}"`);
    }

    const expectation: FunctionExpectation = { name };

    for (const metric of metricsStr.split(',')) {
      const metricMatch = metric.match(/^(cyclomatic|cognitive)=(\d+)$/);
      if (!metricMatch) {
        throw new Error(`Invalid metric: "${metric}". Expected: cyclomatic=N or cognitive=N`);
      }
      expectation[metricMatch[1] as 'cyclomatic' | 'cognitive'] = parseInt(metricMatch[2], 10);
    }

    expectations.push(expectation);
  }

  return expectations;
}
