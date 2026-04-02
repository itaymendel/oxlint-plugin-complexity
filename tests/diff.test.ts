import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseDiff } from '#src/diff-parser.js';
import { analyzeFileComplexity } from '#src/standalone.js';
import { analyzeDiffComplexity } from '#src/diff.js';
import { loadFixturesFromDir, getParseFilename } from './utils/fixture-loader.js';
import { calculateCombinedComplexity } from './utils/test-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// parseDiff
// ---------------------------------------------------------------------------

describe('parseDiff', () => {
  it('parses a single file with one hunk', () => {
    const diff = `diff --git a/file.ts b/file.ts
index abc123..def456 100644
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,4 @@
 const a = 1;
+const b = 2;
+const c = 3;
 const d = 4;
`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe('file.ts');
    expect(files[0].newPath).toBe('file.ts');
    expect(files[0].addedLines).toEqual([2, 3]);
    expect(files[0].deletedLines).toEqual([]);
  });

  it('parses deletions', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,4 +1,2 @@
 const a = 1;
-const b = 2;
-const c = 3;
 const d = 4;
`;

    const files = parseDiff(diff);
    expect(files[0].addedLines).toEqual([]);
    // Deletions occurred at position 2 in the new file (after line 1)
    expect(files[0].deletedLines).toEqual([2, 2]);
  });

  it('parses multiple hunks', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,3 @@
 line1
+added1
 line2
@@ -10,2 +11,3 @@
 line10
+added2
 line11
`;

    const files = parseDiff(diff);
    expect(files[0].addedLines).toEqual([2, 12]);
  });

  it('parses multiple files', () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2
`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0].newPath).toBe('a.ts');
    expect(files[1].newPath).toBe('b.ts');
  });

  it('handles new files', () => {
    const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
+const a = 1;
+const b = 2;
+const c = 3;
`;

    const files = parseDiff(diff);
    expect(files[0].oldPath).toBeNull();
    expect(files[0].newPath).toBe('new.ts');
    expect(files[0].addedLines).toEqual([1, 2, 3]);
  });

  it('handles deleted files', () => {
    const diff = `diff --git a/old.ts b/old.ts
deleted file mode 100644
--- a/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const a = 1;
-const b = 2;
-const c = 3;
`;

    const files = parseDiff(diff);
    expect(files[0].oldPath).toBe('old.ts');
    expect(files[0].newPath).toBeNull();
    expect(files[0].deletedLines.length).toBe(3);
  });

  it('parses hunk header without count (single line)', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1 +1,2 @@
 line1
+line2
`;

    const files = parseDiff(diff);
    expect(files[0].addedLines).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// analyzeFileComplexity
// ---------------------------------------------------------------------------

describe('analyzeFileComplexity', () => {
  it('analyzes a simple function', () => {
    const code = `function foo(x) {
  if (x > 0) {
    return x;
  }
  return -x;
}`;

    const result = analyzeFileComplexity(code, 'test.ts');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('foo');
    expect(result.functions[0].cyclomatic).toBe(2); // 1 base + 1 if
    expect(result.functions[0].cognitive).toBe(1); // 1 if
  });

  it('returns line ranges', () => {
    const code = `function foo() {
  return 1;
}

function bar() {
  return 2;
}`;

    const result = analyzeFileComplexity(code, 'test.ts');
    expect(result.functions).toHaveLength(2);
    expect(result.functions[0].name).toBe('foo');
    expect(result.functions[0].startLine).toBe(1);
    expect(result.functions[0].endLine).toBe(3);
    expect(result.functions[1].name).toBe('bar');
    expect(result.functions[1].startLine).toBe(5);
    expect(result.functions[1].endLine).toBe(7);
  });

  it('analyzes multiple complexity contributors', () => {
    const code = `function complex(a, b, c) {
  if (a) {
    if (b) {
      for (let i = 0; i < 10; i++) {
        if (c) {
          return true;
        }
      }
    }
  }
  return false;
}`;

    const result = analyzeFileComplexity(code, 'test.ts');
    const fn = result.functions[0];
    expect(fn.cyclomatic).toBeGreaterThan(1);
    expect(fn.cognitive).toBeGreaterThan(0);
    expect(fn.cyclomaticPoints.length).toBeGreaterThan(0);
    expect(fn.cognitivePoints.length).toBeGreaterThan(0);
  });

  it('handles arrow functions', () => {
    const code = `const greet = (name) => {
  if (name) {
    return 'hello ' + name;
  }
  return 'hello';
};`;

    const result = analyzeFileComplexity(code, 'test.ts');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('greet');
  });

  it('throws on parse errors', () => {
    expect(() => analyzeFileComplexity('function {{{', 'bad.ts')).toThrow('Parse errors');
  });

  it('names anonymous functions with index', () => {
    const code = `const arr = [1,2,3].map((x) => x * 2);`;

    const result = analyzeFileComplexity(code, 'test.ts');
    expect(result.functions[0].name).toMatch(/anonymous_/);
  });

  it('uses the provided filename', () => {
    const result = analyzeFileComplexity('function f() {}', 'src/app.tsx');
    expect(result.filename).toBe('src/app.tsx');
  });

  describe('cross-validation against existing test helpers', () => {
    const fixtures = loadFixturesFromDir(fixturesDir);

    describe.each(fixtures)('$relativePath', (fixture) => {
      it('should produce matching complexity values', () => {
        const parseFilename = getParseFilename(fixture);
        const standalone = analyzeFileComplexity(fixture.code, parseFilename);
        const reference = calculateCombinedComplexity(fixture.code, parseFilename);

        // Build a lookup from the standalone results
        const standaloneByName = new Map(standalone.functions.map((fn) => [fn.name, fn]));

        // Every function in the reference should match
        for (const [name, refCyc] of reference.cyclomatic) {
          const fn = standaloneByName.get(name);
          expect(fn, `Function "${name}" not found in standalone results`).toBeDefined();
          expect(fn!.cyclomatic).toBe(refCyc.total);
        }

        for (const [name, refCog] of reference.cognitive) {
          const fn = standaloneByName.get(name);
          expect(fn, `Function "${name}" not found in standalone results`).toBeDefined();
          expect(fn!.cognitive).toBe(refCog.total);
        }
      });
    });
  });
});

// ---------------------------------------------------------------------------
// analyzeDiffComplexity
// ---------------------------------------------------------------------------

describe('analyzeDiffComplexity', () => {
  const fileContents: Record<string, string> = {
    'app.ts': `function simple() {
  return 1;
}

function complex(a, b) {
  if (a) {
    if (b) {
      return a + b;
    }
  }
  return 0;
}

function untouched() {
  return 42;
}`,
  };

  const readFile = (path: string) => {
    const content = fileContents[path];
    if (!content) throw new Error(`File not found: ${path}`);
    return content;
  };

  it('returns only functions overlapping with added lines', () => {
    // Diff touches line 7 (inside `complex`)
    const diff = `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -5,6 +5,6 @@
 function complex(a, b) {
   if (a) {
-    if (b) {
+    if (b && b > 0) {
       return a + b;
     }
   }
`;

    const result = analyzeDiffComplexity(diff, { readFile });
    expect(result.files).toHaveLength(1);
    expect(result.files[0].functions).toHaveLength(1);
    expect(result.files[0].functions[0].name).toBe('complex');
  });

  it('excludes untouched functions', () => {
    // Diff only touches line 2 (inside `simple`)
    const diff = `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,3 +1,3 @@
 function simple() {
-  return 1;
+  return 2;
 }
`;

    const result = analyzeDiffComplexity(diff, { readFile });
    expect(result.files[0].functions).toHaveLength(1);
    expect(result.files[0].functions[0].name).toBe('simple');
  });

  it('includes changedLines in result', () => {
    const diff = `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,3 +1,3 @@
 function simple() {
-  return 1;
+  return 2;
 }
`;

    const result = analyzeDiffComplexity(diff, { readFile });
    expect(result.files[0].changedLines).toContain(2);
  });

  it('supports include: both', () => {
    const diff = `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,3 +1,3 @@
 function simple() {
-  return 1;
+  return 2;
 }
`;

    const result = analyzeDiffComplexity(diff, { readFile, include: 'both' });
    expect(result.files[0].functions).toHaveLength(1);
    // Both additions and deletions should appear in changedLines
    expect(result.files[0].changedLines.length).toBeGreaterThan(0);
  });

  it('skips deleted files', () => {
    const diff = `diff --git a/gone.ts b/gone.ts
deleted file mode 100644
--- a/gone.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-function old() {}
`;

    const result = analyzeDiffComplexity(diff, { readFile });
    expect(result.files).toHaveLength(0);
  });

  it('handles new files', () => {
    const newFileContents: Record<string, string> = {
      'new.ts': `function hello() {
  if (true) {
    return 'hi';
  }
}`,
    };

    const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,5 @@
+function hello() {
+  if (true) {
+    return 'hi';
+  }
+}
`;

    const result = analyzeDiffComplexity(diff, {
      readFile: (p) => {
        const c = newFileContents[p];
        if (!c) throw new Error(`Not found: ${p}`);
        return c;
      },
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].functions[0].name).toBe('hello');
  });

  it('skips files that cannot be read', () => {
    const diff = `diff --git a/missing.ts b/missing.ts
--- a/missing.ts
+++ b/missing.ts
@@ -1,3 +1,3 @@
 line1
-old
+new
 line3
`;

    // readFile throws for missing.ts
    const result = analyzeDiffComplexity(diff, { readFile });
    expect(result.files).toHaveLength(0);
  });
});
