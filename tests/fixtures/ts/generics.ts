// @complexity findFirst:cyclomatic=3,cognitive=3 mapValues:cyclomatic=2,cognitive=1
function findFirst<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (const item of items) {
    if (predicate(item)) {
      return item;
    }
  }
  return undefined;
}

function mapValues<K, V, R>(map: Map<K, V>, fn: (v: V) => R): Map<K, R> {
  const result = new Map<K, R>();
  for (const [key, value] of map) {
    result.set(key, fn(value));
  }
  return result;
}
