// @complexity add:cyclomatic=1,cognitive=0 subtract:cyclomatic=1,cognitive=0 isPositive:cyclomatic=2,cognitive=1 processNumbers:cyclomatic=1,cognitive=1 complexStatic:cyclomatic=5,cognitive=5

class MathUtils {
  // Simple static method - no complexity
  static add(a: number, b: number): number {
    return a + b;
  }

  // Another simple static
  static subtract(a: number, b: number): number {
    return a - b;
  }

  // Static with condition
  static isPositive(n: number): boolean {
    if (n > 0) {
      return true;
    }
    return false;
  }

  // Static with callback (array method)
  // Nested arrow function adds +1 to processNumbers scope
  static processNumbers(nums: number[]): number[] {
    return nums.map((n) => n * 2);
  }

  // Complex static with multiple branches
  // if(+1) + else if(+1) + for(+1) + nested if(+2) + nested arrow(+1) = 6 cognitive
  // cyclomatic: base(1) + if(1) + else if(1) + for(1) + if(1) = 5
  static complexStatic(items: number[], threshold: number): number[] {
    if (threshold < 0) {
      return [];
    } else if (threshold === 0) {
      return items;
    }

    const result: number[] = [];
    for (const item of items) {
      if (item > threshold) {
        result.push(item);
      }
    }
    return result;
  }
}
