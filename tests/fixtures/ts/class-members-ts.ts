// @complexity o:cyclomatic=2,cognitive=0 r:cyclomatic=2,cognitive=1 p:cyclomatic=2,cognitive=1 ps:cyclomatic=3,cognitive=0 opt:cyclomatic=2,cognitive=0 n:cyclomatic=2,cognitive=0 cast:cyclomatic=2,cognitive=1 asCast:cyclomatic=2,cognitive=1 satisfiesCast:cyclomatic=2,cognitive=1 constructor:cyclomatic=4,cognitive=1 anonymous_11:cyclomatic=2,cognitive=1
declare const flag: boolean;
declare const a: { b?: { c?: number } };
declare function init(): number | undefined;
type H = () => number;

abstract class Base {
  // No initializer / abstract / definite: not units, no results
  declare d: number;
  abstract ab: string;
  definite!: number;

  // TS modifiers don't change scoring: each is a unit
  override o = flag ?? 'd';
  readonly r = flag && init();
  private p = flag ? 1 : 2;
  protected static ps = a?.b?.c;
  opt?: number = init() || 0;

  // Non-null assertion inside the value
  n = a!.b?.c;

  // Function-valued fields wrapped in TS casts: the function is the unit, named after the field
  cast = <H>(() => {
    if (flag) {
      return 1;
    }
    return 0;
  });
  asCast = (() => {
    if (flag) {
      return 1;
    }
    return 0;
  }) as H;
  satisfiesCast = (() => {
    if (flag) {
      return 1;
    }
    return 0;
  }) satisfies H;

  // Auto-accessor: not a unit; at top level its ternary belongs to no scope and is dropped
  accessor acc = flag ? 1 : 2;

  // Parameter properties with defaults are AssignmentPatterns
  constructor(
    private cx = 1,
    public cy = init() ?? 2
  ) {}

  static {
    if (flag) {
      Base.ps = 1;
    }
  }
}
