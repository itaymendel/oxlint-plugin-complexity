// @complexity functionBranch:cyclomatic=3,cognitive=4 anonymous_1:cyclomatic=1,cognitive=0 mirrored:cyclomatic=3,cognitive=4 anonymous_3:cyclomatic=1,cognitive=0 afterFunctionBranch:cyclomatic=4,cognitive=5 anonymous_5:cyclomatic=1,cognitive=0
// A function used directly as a branch opens its own scope. It must not leave a
// nesting marker in the enclosing scope, or every later structure is over-nested.

// ternary +1, nested function +1, alternate ternary at nesting 1: +2
function functionBranch(condition, other) {
  return condition ? function () {} : other ? 1 : 2;
}

// Same shape mirrored; must score identically
function mirrored(condition, other) {
  return condition ? (other ? 1 : 2) : function () {};
}

// ternary +1, nested arrow +1, if +1, nested if at nesting 1: +2
function afterFunctionBranch(a, b, c) {
  const handler = a ? () => {} : null;
  if (b) {
    if (c) {
      return handler;
    }
  }
  return null;
}
