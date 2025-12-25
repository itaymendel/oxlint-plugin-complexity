// @complexity multilineTest:cyclomatic=4,cognitive=6

/*
 * This is a multi-line block comment that tests whether
 * the parser can handle extensive documentation using
 * the traditional C-style block comment format.
 *
 * Let me explain cognitive complexity in great detail:
 *
 * 1. Structural complexity adds +1 for control flow
 *    structures like if, for, while, switch, catch, ternary
 *
 * 2. Nesting penalty: Each level of nesting adds +1 more
 *    So an if inside a for loop adds +2 (1 base + 1 nesting)
 *
 * This comment block goes on and on to simulate real-world
 * documentation that developers might write.
 */

/**
 * JSDoc style comment block
 * @param {number} value - The value to process
 * @returns {number} - The processed result
 * @example
 * multilineTest(5) // returns 10
 * multilineTest(0) // returns 0
 *
 * More documentation...
 * And even more...
 */
function multilineTest(value) {
  /* inline block comment */ if (value > 0) {
    // for loop with nesting
    for (let i = 0; i < value; i++) {
      /*
       * Another multi-line comment
       * inside the function body
       */
      if (i > 5) {
        return i;
      }
    }
  }
  return 0;
}

/*
 * Trailing multi-line comment
 * that comes after the function
 * and has many lines
 * of content
 * just to test
 * the parser
 */
