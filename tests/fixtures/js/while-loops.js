// @complexity whileLoop:cyclomatic=2,cognitive=1 doWhileLoop:cyclomatic=2,cognitive=1
function whileLoop(condition) {
  while (condition()) {
    process();
  }
}

function doWhileLoop(condition) {
  do {
    process();
  } while (condition());
}
