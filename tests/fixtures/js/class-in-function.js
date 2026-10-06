// @complexity field:cyclomatic=2,cognitive=0 anonymous_2:cyclomatic=2,cognitive=2 outer:cyclomatic=1,cognitive=0
function outer(flag) {
  // Field initializers and static blocks must NOT leak into `outer`
  class Inner {
    field = flag || 0;

    // Nesting starts at 1, so the if adds 2 to the static block's own score.
    static {
      if (flag) {
        Inner.ready = true;
      }
    }
  }
  return new Inner();
}
