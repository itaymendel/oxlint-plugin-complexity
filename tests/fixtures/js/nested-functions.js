// @complexity processItems:cyclomatic=1,cognitive=2 callbackChain:cyclomatic=1,cognitive=3 nestedCallbacks:cyclomatic=1,cognitive=1

// Array method chain: each arrow adds +1 to parent
function processItems(items) {
  return items
    .filter((item) => item.active) // +1 nested
    .map((item) => item.value); // +1 nested
  // Nested arrows themselves have complexity 0, but add +1 each to parent
}

// Longer chain
function callbackChain(data) {
  return data
    .filter((x) => x > 0) // +1 nested
    .map((x) => x * 2) // +1 nested
    .reduce((a, b) => a + b, 0); // +1 nested (reduce callback)
  // forEach adds +1 too
}

// Nested with control flow inside
function nestedCallbacks(items) {
  items.forEach((item) => {
    // +1 nested
    if (item.valid) {
      // +2 (if + nesting from forEach body)
      item.process();
    }
  });
}
