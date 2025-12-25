// @complexity constructor:cyclomatic=2,cognitive=2 process:cyclomatic=3,cognitive=3 getValue:cyclomatic=1,cognitive=0
class DataProcessor {
  private data: number[];

  constructor(data?: number[]) {
    if (data) {
      this.data = data;
    } else {
      this.data = [];
    }
  }

  process(): number {
    let sum = 0;
    for (const item of this.data) {
      if (item > 0) {
        sum += item;
      }
    }
    return sum;
  }

  getValue(): number[] {
    return this.data;
  }
}
