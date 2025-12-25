// @complexity simpleTernary:cyclomatic=2,cognitive=1 chainedTernary:cyclomatic=3,cognitive=2 tripleChained:cyclomatic=4,cognitive=4 ternaryInBranches:cyclomatic=4,cognitive=4

// Simple ternary for baseline
function simpleTernary(a) {
  return a ? 1 : 0;
}

// Chained ternary: a ? 1 : b ? 2 : 3
// First ternary at nesting 0: +1
// Second ternary in alternate (nesting 1): +2
// cognitive: 3
function chainedTernary(a, b) {
  return a ? 1 : b ? 2 : 3;
}

// Triple chained ternary: a ? 1 : b ? 2 : c ? 3 : 4
// cognitive: 1 + 2 + 3 = 6
function tripleChained(a, b, c) {
  return a ? 1 : b ? 2 : c ? 3 : 4;
}

// Ternary in both branches: a ? (b ? 3 : 4) : c ? 5 : 6
// Outer: +1, inner consequent: +1, inner alternate: +1, nesting penalty: +1
// cognitive: 4, cyclomatic: 4 (3 ternaries + base)
function ternaryInBranches(a, b, c) {
  return a ? (b ? 3 : 4) : c ? 5 : 6;
}
