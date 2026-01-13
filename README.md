# oxlint-plugin-complexity

Cyclomatic and cognitive complexity rules for [oxlint](https://oxc.rs/docs/guide/usage/linter.html) with **actionable error messages**. Also available as a standalone library for programmatic complexity analysis.

**Features:**

- Cyclomatic and cognitive complexity analysis.
- Actionable error messages with complexity breakdown.
- [Programmatic API](./src/index.ts) for custom tooling
- Supports `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` `.vue` (extracts `<script>` blocks only)

> **Note:** Only cognitive complexity tracks nesting depth, which enables more actionable suggestions, so refactoring tips available only there.

## Quick Start

```bash
npm install oxlint-plugin-complexity --save-dev
```

```json
// .oxlintrc.json
{
  "jsPlugins": ["oxlint-plugin-complexity"],
  "rules": {
    "complexity/max-cyclomatic": ["error", { "max": 20 }],
    "complexity/max-cognitive": ["error", { "max": 15 }]
  }
}
```

## Actionable Error Messages

Error messages include a summary and detailed line-by-line breakdown with the top offender highlighted. When deep nesting is detected, a refactoring tip is shown:

```
complexity(max-cognitive): Function 'processData' has Cognitive Complexity of 15.
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

## Rules

### `complexity/max-cyclomatic`

Enforces maximum [cyclomatic complexity](https://en.wikipedia.org/wiki/Cyclomatic_complexity) (default: 20).

**+1 for:** `if`, `for`, `for...in`, `for...of`, `while`, `do...while`, `case`, `catch`, `? :`, `&&`, `||`, `??`

### `complexity/max-cognitive`

Enforces maximum [cognitive complexity](https://www.sonarsource.com/resources/cognitive-complexity/) (default: 15).

- **+1 for:** `if`/`for`/`while`/`switch`/`catch`/`? :` (+nesting), `else`, logical sequence changes, nested functions, recursion
- **Excluded:** React components (PascalCase + returns JSX), default value patterns (`a || []`)

#### Refactoring Tips

The plugin detects common complexity patterns and provides actionable tips. All thresholds are configurable (set to `0` to disable):

```jsonc
{
  "complexity/max-cognitive": [
    "error",
    {
      "max": 15,
      "nestingTipThreshold": 3,
      "elseIfChainThreshold": 4,
      "logicalOperatorThreshold": 3,
    },
  ],
}
```

#### Extraction Suggestions (Experimental)

Enable `enableExtraction` to get refactoring suggestions for complex functions. Analyzes variable flow to identify extractable code blocks and potential issues.

```jsonc
{
  "complexity/max-cognitive": [
    "error",
    {
      "max": 15,
      "enableExtraction": true,
      // Only suggest extractions when complexity exceeds 1.5× of max-cognitive threshold
      "extractionMultiplier": 1.5,
      // Only suggest blocks containing at least this % of total complexity
      "minExtractionPercentage": 30,
    },
  ],
}
```

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

---

## Attribution

The cognitive complexity metric is based on [G. Ann Campbell's specification](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) (SonarSource, 2016).

## License

MIT
