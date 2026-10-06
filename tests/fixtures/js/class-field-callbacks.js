// @complexity logger:cyclomatic=1,cognitive=0 anonymous_2:cyclomatic=2,cognitive=2 labels:cyclomatic=1,cognitive=0 inner:cyclomatic=1,cognitive=0 anonymous_5:cyclomatic=2,cognitive=3 tags:cyclomatic=1,cognitive=0 wrap:cyclomatic=1,cognitive=0
class TopLevel {
  // A field named like its callee is not a recursive call
  logger = logger();

  // The callback inherits nesting 1 from the top-level field (ternary +2).
  // Declaring it adds no points to the field.
  labels = items.map((i) => (i ? 'a' : 'b'));
}

function wrap(items) {
  class Inner {
    inner = inner();
    // The field inherits nesting 1 from wrap; the callback starts at 2 (ternary +3).
    tags = items.map((i) => (i ? 'a' : 'b'));
  }
  return new Inner();
}
