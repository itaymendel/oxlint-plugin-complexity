// @complexity getNestedValue:cyclomatic=3,cognitive=0 conditionalAccess:cyclomatic=3,cognitive=1
interface Nested {
  level1?: {
    level2?: {
      value: string;
    };
  };
}

function getNestedValue(obj: Nested): string | undefined {
  // Each ?. is a cyclomatic branch (+2); cognitive ignores optional chaining
  return obj.level1?.level2?.value;
}

function conditionalAccess(obj: Nested): string {
  if (obj.level1?.level2) {
    return obj.level1.level2.value;
  }
  return 'default';
}
