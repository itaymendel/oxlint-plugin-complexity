// @complexity testFunction:cyclomatic=2,cognitive=1

// This is a very long comment block that tests whether
// the parser can handle extensive documentation and
// reasoning about complexity calculations.
//
// For example, let me explain how cognitive complexity
// works in great detail:
//
// 1. Structural complexity adds +1 for control flow
//    structures like if, for, while, switch, catch, ternary
//
// 2. Nesting penalty: Each level of nesting adds +1 more
//    So an if inside a for loop adds +2 (1 base + 1 nesting)
//
// 3. Flat complexity: else-if chains only add +1 (no nesting)
//    Same for else blocks
//
// 4. Logical operators: && and || add +1 for each sequence
//    But chained same operators count as one sequence
//
// 5. Labeled break/continue: +1 each (flat)
//
// This explanation goes on and on and on and on and on
// to simulate a real-world scenario where developers
// might write extensive documentation about their code.
//
// More lines of comments...
// And more...
// And even more...
// Just to make sure we have plenty of comments.

function testFunction(value) {
  if (value) {
    return value * 2;
  }
  return 0;
}

// More comments after the function
// These shouldn't affect anything
// But let's test to be sure
//
// Even more trailing comments
// To really stress test the parser
// And make sure everything works correctly
// With lots and lots of comments
// That go on for many many lines
// Like this one right here
// And this one too
// And another one
// And yet another
// The end.
