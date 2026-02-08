# oxlint-plugin-complexity

Cyclomatic and cognitive complexity rules for [oxlint](https://oxc.rs/docs/guide/usage/linter.html) with **actionable error messages**. Also available as a standalone library for programmatic complexity analysis.

**Features:**

- Cyclomatic and cognitive complexity analysis.
- Actionable error messages with complexity breakdown.
- [Programmatic API](./src/index.ts) for custom tooling
- **Framework support:** React, Vue, Angular, Svelte, Astro, Solid, Qwik
- **File types:** `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` `.vue` `.svelte` `.astro`

> **Note:** Refactoring tips require cognitive complexity (only it tracks nesting depth).

## Quick Start

```bash
npm install oxlint-plugin-complexity --save-dev
```

```json
// .oxlintrc.json
{
  "jsPlugins": ["oxlint-plugin-complexity"],
  "rules": {
    "complexity/complexity": [
      "error",
      {
        "cyclomatic": 20,
        "cognitive": 15
      }
    ]
  }
}
```

## Actionable Error Messages

Error messages show a summary, line-by-line breakdown, and refactoring tips for deep nesting:

```
complexity(complexity): Function 'processData' has Cognitive Complexity of 15.
Maximum allowed is 10. [if: +14, for: +1]

Breakdown:
   Line 2: +1 for 'for'
   Line 3: +2 for 'if' (incl. +1 nesting)
   Line 4: +3 for 'if' (incl. +2 nesting)
   Line 5: +4 for 'if' (incl. +3 nesting)
>>> Line 6: +5 for 'if' (incl. +4 nesting) [top offender]
    ↳ Tip: Extract inner loops into helper functions - each extraction removes one nesting level
```

```javascript
function processData(items, mode, config) {
  for (const item of items) {
    // Line 2: +1
    if (item.active) {
      // Line 3: +2 (nesting=1)
      if (mode === 'strict') {
        // Line 4: +3 (nesting=2)
        if (config.validate) {
          // Line 5: +4 (nesting=3)
          if (item.required) {
            // Line 6: +5 (nesting=4) <- top offender
          }
        }
      }
    }
  }
}
```

## Rule Configuration

```jsonc
{
  "complexity/complexity": [
    "error",
    {
      // Complexity thresholds
      "cyclomatic": 20, // Default: 20
      "cognitive": 15, // Default: 15

      // Extraction suggestions (optional)
      "enableExtraction": true, // Default: false
      "extractionMultiplier": 1.5, // Default: 1.5 (triggers at 1.5× cognitive threshold)
      "minExtractionPercentage": 30, // Default: 30 (min % of total complexity to suggest)

      // Refactoring tip thresholds (optional, set to 0 to disable)
      "nestingTipThreshold": 3, // Default: 3
      "elseIfChainThreshold": 4, // Default: 4
      "logicalOperatorThreshold": 3, // Default: 3
    },
  ],
}
```

### Cyclomatic Complexity

Counts decision points in code. [Learn more](https://en.wikipedia.org/wiki/Cyclomatic_complexity)

**+1 for:** `if`, `for`, `for...in`, `for...of`, `while`, `do...while`, `case`, `catch`, `? :`, `&&`, `||`, `??`

### Cognitive Complexity

Measures how difficult code is to understand by penalizing nesting. [Learn more](https://www.sonarsource.com/resources/cognitive-complexity/)

- **+1 for:** `if`/`for`/`while`/`switch`/`catch`/`? :` (+nesting), `else`, logical sequence changes, nested functions, recursion
- **Excluded:** React components (PascalCase + returns JSX), default value patterns (`a || []`)

### Refactoring Tips

Detects common complexity patterns and provides actionable tips:

- **Deep nesting** (`nestingTipThreshold`): Suggests extracting inner loops/conditions
- **Long else-if chains** (`elseIfChainThreshold`): Recommends lookup tables or strategy pattern
- **Logical operator sequences** (`logicalOperatorThreshold`): Suggests extracting boolean expressions

### Extraction Suggestions

When `enableExtraction: true`, analyzes variable flow to identify extractable code blocks:

**Example output:**

```
Smart extraction suggestions:

  Lines 9-22: Extractable with some refactoring
    Complexity: +11 (55% of total)
    Inputs: order, config, processedItems
    Suggested: processOrder(order, config, processedItems): void

  Lines 25-33: Requires significant refactoring
    Complexity: +6 (30% of total)
    Inputs: config, totalCount, processedItems
    Issue: Mutates external variable 'totalCount' (line 27)
    Suggestion: Consider returning 'totalCount' instead of mutating it
```

**TypeScript support:** Preserves type annotations in suggested signatures:

```
Inputs: config: Config, results: number[]
Suggested: processBlock(config: Config, results: number[]): void
```

#### Known Limitations

Extraction suggestions use static analysis heuristics and may miss:

- **Globals/module variables** (not tracked by variable flow analysis)
- **Complex flows** (closures, dynamic properties, indirect mutations)

Always review suggestions before applying, even when marked "high confidence".

---

## Migration from v0.x to v1.0

**v1.0:** Combined rule for better performance. Separate rules deprecated:

```diff
// .oxlintrc.json
{
  "jsPlugins": ["oxlint-plugin-complexity"],
  "rules": {
-   "complexity/max-cyclomatic": ["error", { "max": 20 }],
-   "complexity/max-cognitive": ["error", { "max": 15 }]
+   "complexity/complexity": ["error", {
+     "cyclomatic": 20,
+     "cognitive": 15
+   }]
  }
}
```

---

## Attribution

The cognitive complexity metric is based on [G. Ann Campbell's specification](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) (SonarSource, 2016).

## License

MIT
