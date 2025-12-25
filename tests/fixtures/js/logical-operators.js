// @complexity logicalAnd:cyclomatic=2,cognitive=1 logicalOr:cyclomatic=2,cognitive=1 logicalChain:cyclomatic=4,cognitive=1 mixedLogical:cyclomatic=3,cognitive=2
function logicalAnd(a, b) {
  return a && b;
}

function logicalOr(a, b) {
  return a || b;
}

function logicalChain(a, b, c, d) {
  // Same operator repeated = only +1 cognitive
  return a && b && c && d;
}

function mixedLogical(a, b, c) {
  // Operator change = +1 for each change
  return (a && b) || c;
}
