// @complexity isEven:cyclomatic=2,cognitive=1 isOdd:cyclomatic=2,cognitive=1 ping:cyclomatic=2,cognitive=1 pong:cyclomatic=2,cognitive=1

// Mutual recursion: isEven calls isOdd, isOdd calls isEven
// Note: Mutual recursion is NOT detected by the recursion detector
// (which only detects self-recursion like foo() inside foo)
// This is expected behavior - mutual recursion detection requires
// call graph analysis which is out of scope.

function isEven(n) {
  if (n === 0) return true;
  return isOdd(n - 1);
}

function isOdd(n) {
  if (n === 0) return false;
  return isEven(n - 1);
}

// Another mutual recursion example
function ping(n) {
  if (n <= 0) return 'done';
  return pong(n - 1);
}

function pong(n) {
  if (n <= 0) return 'done';
  return ping(n - 1);
}
