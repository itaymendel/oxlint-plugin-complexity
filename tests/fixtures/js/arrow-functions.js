// @complexity simple:cyclomatic=1,cognitive=0 withIf:cyclomatic=2,cognitive=1 anonymous_3:cyclomatic=2,cognitive=1
const simple = () => 42;

const withIf = (x) => {
  if (x > 0) {
    return x;
  }
  return 0;
};

// Anonymous arrow function in array
const handlers = [
  (x) => {
    if (x) {
      return x * 2;
    }
    return x;
  },
];
