// @complexity simple:cyclomatic=1,cognitive=0 fallback:cyclomatic=2,cognitive=0 mode:cyclomatic=2,cognitive=1 nested:cyclomatic=3,cognitive=0 registry:cyclomatic=1,cognitive=0 handler:cyclomatic=2,cognitive=1 secret:cyclomatic=2,cognitive=1 anonymous_8:cyclomatic=2,cognitive=1 anonymous_9:cyclomatic=2,cognitive=1 method:cyclomatic=2,cognitive=0
class Config {
  // Each field initializer is its own unit with base complexity 1
  simple = 1;

  // No initializer: not a unit, no result
  noValue;

  // `||` with a literal fallback: cyclomatic +1, cognitive default-value pattern (0)
  fallback = readEnv() || 'dev';

  // Ternary: +1 both
  mode = isProd ? 'a' : 'b';

  // Two `?.`: cyclomatic +2, cognitive 0
  nested = globalThis.config?.deep?.value;

  static registry = new Map();

  // Function-valued field: the arrow is the unit, named after the field
  handler = () => {
    if (this.simple) {
      return 1;
    }
    return 0;
  };

  // Private field with `&&`
  #secret = isProd && this.simple;

  // Static blocks are their own units (anonymous_8, anonymous_9: 8th/9th unit to complete)
  static {
    if (isProd) {
      Config.registry.set('mode', 'prod');
    }
  }

  static {
    for (const key of Object.keys(defaults)) {
      Config.registry.set(key, defaults[key]);
    }
  }

  method(p = 1) {
    return p;
  }
}
