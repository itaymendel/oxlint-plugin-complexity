// @complexity isString:cyclomatic=2,cognitive=1 processValue:cyclomatic=2,cognitive=1
function isString(value: unknown): value is string {
  if (typeof value === 'string') {
    return true;
  }
  return false;
}

function processValue(value: string | number): string {
  if (isString(value)) {
    return value.toUpperCase();
  }
  return String(value);
}
