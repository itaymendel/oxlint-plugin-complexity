// @complexity nestedInElse:cyclomatic=3,cognitive=4 loopInElse:cyclomatic=3,cognitive=4 elseIfThenElse:cyclomatic=4,cognitive=5
// Statements inside a plain `else` block are one nesting level deeper (+1 nesting).

function nestedInElse(a, b) {
  if (a) {
    return 1;
  } else {
    if (b) {
      return 2;
    }
  }
  return 3;
}

function loopInElse(a, items) {
  if (a) {
    return 0;
  } else {
    for (const item of items) {
      process(item);
    }
  }
  return 1;
}

// if +1, else-if +1, else +1, nested if inside the final else: +2 (nesting 1)
function elseIfThenElse(a, b, c) {
  if (a) {
    return 1;
  } else if (b) {
    return 2;
  } else {
    if (c) {
      return 3;
    }
  }
  return 4;
}
