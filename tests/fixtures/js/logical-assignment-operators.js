// @complexity logicalOrAssignment:cyclomatic=2,cognitive=0 logicalAndAssignment:cyclomatic=2,cognitive=0 nullishAssignment:cyclomatic=2,cognitive=0 multipleAssignments:cyclomatic=4,cognitive=0 assignmentWithCondition:cyclomatic=4,cognitive=1

// Logical OR assignment: ||= adds +1 to cyclomatic only
function logicalOrAssignment(a, b) {
  a ||= b;
  return a;
}

// Logical AND assignment: &&= adds +1 to cyclomatic only
function logicalAndAssignment(a, b) {
  a &&= b;
  return a;
}

// Nullish coalescing assignment: ??= adds +1 to cyclomatic only
function nullishAssignment(a, b) {
  a ??= b;
  return a;
}

// Multiple logical assignments
function multipleAssignments(a, b, c) {
  a ||= b;
  b &&= c;
  c ??= a;
  return [a, b, c];
}

// Logical assignment combined with condition
function assignmentWithCondition(obj, defaultValue) {
  obj.value ||= defaultValue;
  obj.count ??= 0;
  if (obj.value) {
    return obj;
  }
  return null;
}
