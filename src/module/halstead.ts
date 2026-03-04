export interface HalsteadCounts {
  operators: Map<string, number>;
  operands: Map<string, number>;
}

/**
 * Halstead metrics derived from operator/operand counts.
 *
 * Formulas (Halstead, 1977):
 *   length     = N1 + N2
 *   vocabulary = n1 + n2
 *   volume     = length * log2(vocabulary)
 *   difficulty = (n1 / 2) * (N2 / n2)
 *   effort     = difficulty * volume
 *   bugs       = volume / 3000
 *   time       = effort / 18  (seconds)
 */
export interface HalsteadMetrics {
  n1: number;
  n2: number;
  N1: number;
  N2: number;
  length: number;
  vocabulary: number;
  volume: number;
  difficulty: number;
  effort: number;
  bugs: number;
  time: number;
}

export function incrementCount(map: Map<string, number>, key: string, amount: number = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function calculateHalsteadMetrics(counts: HalsteadCounts): HalsteadMetrics {
  const n1 = counts.operators.size;
  const n2 = counts.operands.size;
  const N1 = sumValues(counts.operators);
  const N2 = sumValues(counts.operands);

  const length = N1 + N2;
  const vocabulary = n1 + n2;
  const volume = vocabulary > 0 ? length * Math.log2(vocabulary) : 0;
  const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
  const effort = difficulty * volume;
  const bugs = volume / 3000;
  const time = effort / 18;

  return { n1, n2, N1, N2, length, vocabulary, volume, difficulty, effort, bugs, time };
}

export function createHalsteadCounts(): HalsteadCounts {
  return { operators: new Map(), operands: new Map() };
}

export function mergeHalsteadCounts(target: HalsteadCounts, source: HalsteadCounts): void {
  for (const [key, count] of source.operators) {
    incrementCount(target.operators, key, count);
  }
  for (const [key, count] of source.operands) {
    incrementCount(target.operands, key, count);
  }
}

function sumValues(map: Map<string, number>): number {
  let total = 0;
  for (const count of map.values()) {
    total += count;
  }
  return total;
}
