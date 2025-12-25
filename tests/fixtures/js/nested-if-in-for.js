// @complexity nestedIfInFor:cyclomatic=3,cognitive=3
function nestedIfInFor(items) {
  for (const item of items) {
    if (item.active) {
      process(item);
    }
  }
}
