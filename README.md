# oxlint-plugin-complexity

Cyclomatic and cognitive complexity rules for [oxlint](https://oxc.rs/docs/guide/usage/linter.html) with **actionable error messages**, **module-level analysis**, and a standalone library API.

**Features:**

- Cyclomatic and cognitive complexity analysis
- Module-level analysis: Halstead metrics, module complexity score, aggregate complexity
- Actionable error messages with complexity breakdown
- [Programmatic API](#programmatic-api) for custom tooling
- **Framework support:** React, Vue, Angular, Svelte, Astro, Solid, Qwik
- **File types:** `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` `.vue` `.svelte` `.astro`

> **Note:** Refactoring tips require cognitive complexity (only it tracks nesting depth).

## Quick Start

```bash
npm install oxlint-plugin-complexity --save-dev
```

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["oxlint-plugin-complexity"],
  "rules": {
    "complexity/complexity": [
      "error",
      {
        "cyclomatic": 20,
        "cognitive": 15,
        "moduleComplexity": 80,
      },
    ],
  },
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

      // Performance optimization (optional)
      "minLines": 10, // Default: 10 (skip functions <10 lines like getters; 0 = analyze all; counts comments/blanks)

      // Module-level analysis (omit "moduleComplexity" to disable)
      "moduleComplexity": 80, // Maximum module complexity score (0-100). Enables module analysis.
      "maxCyclomaticSum": 0, // Default: 0 (disabled; max total cyclomatic across all functions)
      "maxCognitiveSum": 0, // Default: 0 (disabled; max total cognitive across all functions)
      // Extraction suggestions (optional)
      "enableExtraction": true, // Default: true
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

Analyzes variable flow to identify extractable code blocks (enabled by default, disable with `enableExtraction: false`):

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

### Module-Level Analysis

When `moduleComplexity` is set, the rule analyzes the entire file and reports actionable, plain-language insights.

**What is "module complexity"?** It's the inverted [Maintainability Index](https://en.wikipedia.org/wiki/Maintainability#Software_engineering) on a 0-100 scale: `moduleComplexity = 100 - scaledMI`. Under the hood it combines Halstead effort, cyclomatic complexity, and lines of code.

**Config options:**

- **`moduleComplexity`** — Maximum module complexity score (0-100). Enables module analysis. When violated, the report includes estimated bug risk, reading time, and identifies the main contributor.
- **`maxCyclomaticSum`** — Maximum total cyclomatic complexity across all functions. Default: 0 (disabled).
- **`maxCognitiveSum`** — Maximum total cognitive complexity across all functions. Default: 0 (disabled).
  **Example config:**

```jsonc
"moduleComplexity": 80,
"maxCyclomaticSum": 30,
"maxCognitiveSum": 40
```

**Example output:**

```text
Module is too complex (score: 81.5/100, maximum: 80).
Estimated bug risk: ~2.3 defects. Estimated reading time: ~42 min.
Main contributor: complex expressions increase bug risk.
Module has too many decision paths (total: 45, maximum: 30).
Module is too hard to read (cognitive total: 52, maximum: 40).
```

The main contributor tells you _why_ the score is high:

- "complex expressions increase bug risk" — Halstead effort dominates
- "too many decision branches" — cyclomatic complexity dominates
- "functions are too long" — lines of code dominate

### Programmatic API

Use `analyzeModule` for complexity analysis outside of linting (CI scripts, custom tools, etc.):

```typescript
import { analyzeModule } from 'oxlint-plugin-complexity/analyze';

const result = analyzeModule(code, 'module.ts');

console.log(result.moduleComplexity); // 0-100 (higher = more complex)
console.log(result.complexityDecomposition); // { effortTerm, cyclomaticTerm, locTerm, mainContributor }
console.log(result.functions); // per-function metrics
console.log(result.cyclomatic.sum); // aggregate cyclomatic
console.log(result.halstead.effort); // module-wide Halstead effort
```

Returns `ModuleAnalysisResult` with per-function cyclomatic, cognitive, and Halstead metrics, module-wide aggregates, module complexity score, and complexity decomposition.

---

## Migration from v0.x

Replace the removed `max-cyclomatic` / `max-cognitive` rules with the combined `complexity` rule:

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
