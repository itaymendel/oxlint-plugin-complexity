// @complexity earlyReturn:cyclomatic=3,cognitive=2 guardClauses:cyclomatic=5,cognitive=4 multipleExitPoints:cyclomatic=4,cognitive=2

// Early returns don't add complexity themselves
// Only the conditions that guard them add complexity
function earlyReturn(a, b) {
  if (a) {
    return a;
  }
  if (b) {
    return b;
  }
  return null;
}

// Guard clause pattern - common in defensive programming
// Multiple early returns with simple conditions
function guardClauses(value) {
  if (value === null) return null;
  if (value === undefined) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

// Multiple exit points from different branches
function multipleExitPoints(type, data) {
  if (!data) {
    return null;
  }

  switch (type) {
    case 'a':
      return processA(data);
    case 'b':
      return processB(data);
    default:
      return data;
  }
}
