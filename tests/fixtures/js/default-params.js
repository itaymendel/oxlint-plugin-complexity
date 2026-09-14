// @complexity simpleDefault:cyclomatic=2,cognitive=0 multipleDefaults:cyclomatic=3,cognitive=0 destructuredParam:cyclomatic=3,cognitive=0 arrayDestructuredParam:cyclomatic=3,cognitive=0 destructuredBody:cyclomatic=3,cognitive=0 defaultInForOf:cyclomatic=3,cognitive=1 defaultWithTernary:cyclomatic=4,cognitive=1 nestedDestructuring:cyclomatic=3,cognitive=0 catchDefault:cyclomatic=3,cognitive=1 arrowDefault:cyclomatic=2,cognitive=0
function simpleDefault(a = 1) {
  return a;
}

function multipleDefaults(a = 1, b = 2) {
  return a + b;
}

function destructuredParam({ x = 0, y = 0 }) {
  return x + y;
}

function arrayDestructuredParam([first = 0, second = 1]) {
  return first + second;
}

function destructuredBody(opts) {
  const { x = 0, y = 0 } = opts;
  return x + y;
}

function defaultInForOf(items) {
  let total = 0;
  for (const { value = 0 } of items) {
    total += value;
  }
  return total;
}

function defaultWithTernary(a = 1, b = a > 0 ? 1 : 2) {
  return a + b;
}

function nestedDestructuring({ a: { b = 1 } = {} }) {
  return b;
}

function catchDefault(fn) {
  try {
    return fn();
  } catch ({ message = '' }) {
    return message;
  }
}

const arrowDefault = (x = 5) => x * 2;
