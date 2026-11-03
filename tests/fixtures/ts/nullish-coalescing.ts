// @complexity getValueOrDefault:cyclomatic=2,cognitive=0 chainedNullish:cyclomatic=3,cognitive=1
function getValueOrDefault(value: string | null | undefined): string {
  // Constant fallback is exempt in any position, including return
  return value ?? 'default';
}

function chainedNullish(a: string | null, b: string | null, c: string): string {
  // Same operator (??) repeated = only +1 cognitive
  return a ?? b ?? c;
}
