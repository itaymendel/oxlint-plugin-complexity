// @complexity factorial:cyclomatic=2,cognitive=2 fibonacci:cyclomatic=3,cognitive=3 sumArray:cyclomatic=2,cognitive=2 withCall:cyclomatic=2,cognitive=2 withApply:cyclomatic=2,cognitive=2 withBind:cyclomatic=2,cognitive=2

// Direct recursion: +1 for if, +1 for recursion
function factorial(n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

// Multiple recursive calls
function fibonacci(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Recursion with array
function sumArray(arr) {
  if (arr.length === 0) {
    return 0;
  }
  return arr[0] + sumArray(arr.slice(1));
}

// Recursion via .call()
function withCall(n) {
  if (n <= 0) {
    return 0;
  }
  return withCall.call(null, n - 1);
}

// Recursion via .apply()
function withApply(n) {
  if (n <= 0) {
    return 0;
  }
  return withApply.apply(null, [n - 1]);
}

// Recursion via .bind()()
function withBind(n) {
  if (n <= 0) {
    return 0;
  }
  return withBind.bind(null)(n - 1);
}
