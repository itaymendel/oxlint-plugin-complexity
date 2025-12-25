// @complexity funcA:cyclomatic=2,cognitive=1 funcB:cyclomatic=3,cognitive=3 funcC:cyclomatic=1,cognitive=0
function funcA(x) {
  if (x) {
    return true;
  }
  return false;
}

function funcB(items) {
  for (const item of items) {
    if (item.active) {
      process(item);
    }
  }
}

function funcC() {
  return 42;
}
