// @complexity constructor:cyclomatic=3,cognitive=0 describe:cyclomatic=1,cognitive=0
class Point {
  // TS parameter properties with defaults are AssignmentPatterns (+1 each)
  constructor(
    private x = 1,
    public y = 2
  ) {}

  describe(): string {
    return `${this.x},${this.y}`;
  }
}
