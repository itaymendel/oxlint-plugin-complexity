# oxlint-plugin-complexity

Cyclomatic and cognitive complexity rules for [oxlint](https://oxc.rs/docs/guide/usage/linter.html) with **actionable error messages**. Also available as a standalone library for programmatic complexity analysis.

**Features:**

- Cyclomatic and cognitive complexity analysis.
- Actionable error messages with complexity breakdown.
- [Programmatic API](./src/index.ts) for custom tooling
- Supports `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` `.vue` (extracts `<script>` blocks only)

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

The following error message showcase what is actionable for the specific function by describing penalties.

```
complexity(max-cognitive): Function 'processData' has a Cognitive Complexity of 6.
Refactor to reduce it to the 5 allowed. [if: +5, for...of: +1]
                                         ^^^^^^^^^^^^^^^^^^^^
```

```javascript
function processData(items, mode) {
  for (const item of items) {
    // +1
    if (item.active) {
      // +2 (nesting)
      if (mode === 'strict') {
      } // +3 (nesting)
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

---

## Attribution

The cognitive complexity metric is based on [G. Ann Campbell's specification](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) (SonarSource, 2016).

## License

MIT
