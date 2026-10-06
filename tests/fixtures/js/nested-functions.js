// @complexity processItems:cyclomatic=1,cognitive=0 callbackChain:cyclomatic=1,cognitive=0 nestedCallbacks:cyclomatic=1,cognitive=0 anonymous_8:cyclomatic=2,cognitive=2

// Array method chain: declaring callbacks adds no points to the parent
function processItems(items) {
  return items
    .filter((item) => item.active)
    .map((item) => item.value);
  // Each callback also scores 0 because it has no branching.
}

// Longer chain
function callbackChain(data) {
  return data
    .filter((x) => x > 0)
    .map((x) => x * 2)
    .reduce((a, b) => a + b, 0);
}

// Nested with control flow inside
function nestedCallbacks(items) {
  items.forEach((item) => {
    // Callback starts at nesting 1 and is scored separately.
    if (item.valid) {
      // +2 (if + inherited function nesting)
      item.process();
    }
  });
}
