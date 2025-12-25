// @complexity withDefaults:cyclomatic=4,cognitive=0 selfAssignment:cyclomatic=3,cognitive=0 nullishDefaults:cyclomatic=3,cognitive=0 mixedPatterns:cyclomatic=3,cognitive=1 chainedDefaults:cyclomatic=4,cognitive=0

// Default value patterns - || with literal/array/object should NOT add complexity
function withDefaults(opts) {
  const items = opts.items || [];
  const name = opts.name || 'default';
  const config = opts.config || {};
  return { items, name, config };
}

// Self-assignment defaults - should NOT add complexity
function selfAssignment(a, b) {
  a = a || [];
  b = b || {};
  return { a, b };
}

// Nullish coalescing defaults - should NOT add complexity
function nullishDefaults(opts) {
  const count = opts.count ?? 0;
  const label = opts.label ?? 'untitled';
  return { count, label };
}

// Mixed: defaults (excluded) + real logic (counted)
function mixedPatterns(opts) {
  const items = opts.items || []; // excluded
  if (items.length > 0) {
    // +1 cognitive
    return items[0];
  }
  return null;
}

// Chained defaults - getRightmostInChain follows to the end
function chainedDefaults(a, b, c) {
  const val = a || b || c || 'fallback'; // should NOT add complexity
  return val;
}
