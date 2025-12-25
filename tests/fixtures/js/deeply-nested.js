// @complexity deeplyNested:cyclomatic=5,cognitive=10
function deeplyNested(items) {
  for (const item of items) {
    // +1 cyclo, +1 cognitive
    if (item.active) {
      // +1 cyclo, +2 cognitive (nesting=1)
      for (const child of item.children) {
        // +1 cyclo, +3 cognitive (nesting=2)
        if (child.valid) {
          // +1 cyclo, +4 cognitive (nesting=3)
          process(child);
        }
      }
    }
  }
}
