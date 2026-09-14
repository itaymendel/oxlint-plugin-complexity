// @complexity outer:cyclomatic=5,cognitive=5 value:cyclomatic=2,cognitive=0 handler:cyclomatic=2,cognitive=1 anonymous_3:cyclomatic=2,cognitive=1 anonymous_4:cyclomatic=2,cognitive=1
function outer(a: unknown, b: unknown, c: boolean) {
  // A field unit owns only its value. Decorator arguments and computed keys belong to the
  // ENCLOSING scope — so `outer` collects both `??` and both key ternaries below.
  class Inner {
    @dec(a ?? b) value = a || 'default';

    @dec(a ?? b) handler = () => {
      if (c) {
        return 1;
      }
      return 0;
    };

    [c ? 'x' : 'y'] = c ? 1 : 2;

    static [c ? 'p' : 'q'] = c ? 3 : 4;
  }
  return Inner;
}
