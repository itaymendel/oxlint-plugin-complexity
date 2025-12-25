// @complexity getNestedValue:cyclomatic=1,cognitive=0 conditionalAccess:cyclomatic=2,cognitive=1
interface Nested {
  level1?: {
    level2?: {
      value: string;
    };
  };
}

function getNestedValue(obj: Nested): string | undefined {
  // Optional chaining doesn't add complexity
  return obj.level1?.level2?.value;
}

function conditionalAccess(obj: Nested): string {
  if (obj.level1?.level2) {
    return obj.level1.level2.value;
  }
  return 'default';
}
