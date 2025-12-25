// @complexity traverse:cyclomatic=2,cognitive=2 processNode:cyclomatic=3,cognitive=3 computedAccess:cyclomatic=2,cognitive=2 viaCall:cyclomatic=2,cognitive=2

class TreeTraverser {
  // Method recursion via this: +1 for if, +1 for recursion
  traverse(node: { left?: unknown; right?: unknown } | null): void {
    if (node) {
      this.traverse(node.left as typeof node);
    }
  }

  // Multiple this.method() calls
  processNode(node: { left?: unknown; right?: unknown; value: number } | null): number {
    if (!node) {
      return 0;
    }
    if (node.value < 0) {
      return this.processNode(node.left as typeof node);
    }
    return node.value + this.processNode(node.right as typeof node);
  }

  // Computed property access: this["methodName"]()
  computedAccess(n: number): number {
    if (n <= 0) {
      return 0;
    }
    return this['computedAccess'](n - 1);
  }

  // Via this.method.call()
  viaCall(n: number): number {
    if (n <= 0) {
      return 0;
    }
    return this.viaCall.call(this, n - 1);
  }
}
