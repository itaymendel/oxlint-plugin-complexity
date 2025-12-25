// @complexity simplePromise:cyclomatic=1,cognitive=0 promiseWithThen:cyclomatic=1,cognitive=1 promiseWithCatch:cyclomatic=1,cognitive=1 fullChain:cyclomatic=1,cognitive=3 chainWithCondition:cyclomatic=1,cognitive=2

// Simple promise return - no complexity
function simplePromise(): Promise<number> {
  return Promise.resolve(42);
}

// Promise with .then() callback
// Nested arrow function adds +1 to parent scope
function promiseWithThen(): Promise<number> {
  return Promise.resolve(1).then((x) => x * 2);
}

// Promise with .catch() callback
// Nested arrow function adds +1 to parent scope
function promiseWithCatch(): Promise<number> {
  return Promise.resolve(1).catch((err) => 0);
}

// Full promise chain: .then().catch().finally()
// 3 nested arrow functions = +3 to parent scope
function fullChain(): Promise<string> {
  return fetch('/api')
    .then((response) => response.json())
    .catch((error) => ({ error }))
    .finally(() => console.log('done'));
}

// Promise chain with condition in callback
// +1 for nested then callback, +1 for nested catch callback
// +1 for if inside then (but that's in callback scope)
// Testing shows cognitive=3 for parent function
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
