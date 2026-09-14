// @complexity field:cyclomatic=2,cognitive=0 anonymous_2:cyclomatic=2,cognitive=1 outer:cyclomatic=1,cognitive=0
function outer(flag) {
  // Field initializers and static blocks must NOT leak into `outer`
  class Inner {
    field = flag || 0;

    static {
      if (flag) {
        Inner.ready = true;
      }
    }
  }
  return new Inner();
}
