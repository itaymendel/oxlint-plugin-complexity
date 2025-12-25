// @complexity simpleOr:cyclomatic=2,cognitive=1 simpleAnd:cyclomatic=2,cognitive=1 groupedOrAnd:cyclomatic=4,cognitive=3 chainedOrs:cyclomatic=4,cognitive=1 mixedChain:cyclomatic=6,cognitive=4 complexNested:cyclomatic=6,cognitive=4

// Simple OR for baseline
function simpleOr(a, b) {
  return a || b;
}

// Simple AND for baseline
function simpleAnd(a, b) {
  return a && b;
}

// Grouped expression: (a && b) || (c && d)
// cognitive: ||=+1, left &&=+1, right &&=+1 = 3
// cyclomatic: base(1) + 3 operators = 4
function groupedOrAnd(a, b, c, d) {
  return (a && b) || (c && d);
}

// Chained ORs: a || b || c || d
// All same operator = one sequence: +1 cognitive
function chainedOrs(a, b, c, d) {
  return a || b || c || d;
}

// Mixed chain: (a && b) || (c && d) || (e && f)
// cognitive: 4 (1 for || sequence, 3 for each &&)
// cyclomatic: base(1) + 5 operators = 6
function mixedChain(a, b, c, d, e, f) {
  return (a && b) || (c && d) || (e && f);
}

// Complex nested: (a || b) && (c || d) && (e || f)
// cognitive: 3 (1 for && sequence, 3 for each ||... wait that's 4)
// Actually testing shows cognitive=3, cyclomatic=6
function complexNested(a, b, c, d, e, f) {
  return (a || b) && (c || d) && (e || f);
}
