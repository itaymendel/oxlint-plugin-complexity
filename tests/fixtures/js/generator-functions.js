// @complexity simpleGenerator:cyclomatic=1,cognitive=0 generatorWithIf:cyclomatic=2,cognitive=1 generatorWithLoop:cyclomatic=2,cognitive=1 complexGenerator:cyclomatic=3,cognitive=3

// Simple generator with no control flow
function* simpleGenerator() {
  yield 1;
  yield 2;
  yield 3;
}

// Generator with conditional
function* generatorWithIf(condition) {
  if (condition) {
    yield 1;
  }
  yield 2;
}

// Generator with loop
function* generatorWithLoop(items) {
  for (const item of items) {
    yield item;
  }
}

// Complex generator with nested control flow
// for(+1) + if(+2 nested) = 3 cognitive
function* complexGenerator(items, filter) {
  for (const item of items) {
    if (filter(item)) {
      yield item;
    }
  }
}
