// @complexity simplePromise:cyclomatic=1,cognitive=0 promiseWithThen:cyclomatic=1,cognitive=0 promiseWithCatch:cyclomatic=1,cognitive=0 fullChain:cyclomatic=1,cognitive=0 chainWithCondition:cyclomatic=1,cognitive=0

// Simple promise return - no complexity
function simplePromise(): Promise<number> {
  return Promise.resolve(42);
}

// Promise with .then() callback
// Declaring the callback adds no points to the parent scope.
function promiseWithThen(): Promise<number> {
  return Promise.resolve(1).then((x) => x * 2);
}

// Promise with .catch() callback
// Declaring the callback adds no points to the parent scope.
function promiseWithCatch(): Promise<number> {
  return Promise.resolve(1).catch((err) => 0);
}

// Full promise chain: .then().catch().finally()
// All callbacks score 0 and add no points to the parent scope.
function fullChain(): Promise<string> {
  return fetch('/api')
    .then((response) => response.json())
    .catch((error) => ({ error }))
    .finally(() => console.log('done'));
}

// Promise chain with condition in callback
// The if scores +2 inside the then callback (inherited nesting=1).
// Both callbacks are reported separately; the parent scores 0.
function chainWithCondition(): Promise<string | null> {
  return fetch('/api')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed');
      }
      return response.text();
    })
    .catch((err) => null);
}
