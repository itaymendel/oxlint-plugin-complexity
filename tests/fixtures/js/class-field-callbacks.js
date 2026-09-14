// @complexity logger:cyclomatic=1,cognitive=0 anonymous_2:cyclomatic=2,cognitive=1 labels:cyclomatic=1,cognitive=0 inner:cyclomatic=1,cognitive=0 anonymous_5:cyclomatic=2,cognitive=1 tags:cyclomatic=1,cognitive=0 wrap:cyclomatic=1,cognitive=0
class TopLevel {
  // A field named like its callee is not a recursive call
  logger = logger();

  // A callback inside a field initializer is nested in the field, not in a function:
  // no "nested function" penalty on the field, regardless of where the class lives
  labels = items.map((i) => (i ? 'a' : 'b'));
}

function wrap(items) {
  class Inner {
    inner = inner();
    tags = items.map((i) => (i ? 'a' : 'b'));
  }
  return new Inner();
}
