# Contributing

## Development Setup

```bash
npm install
npm run build
```

## Testing

Run the test suite:

```bash
npm test          # Watch mode
npm run test:run  # Single run
npm run lint      # Dogfood: lint this plugin with itself
```

### Fixture-Based Testing

Tests use fixture files with expected complexity values in comments:

```javascript
// @complexity myFunction:cyclomatic=3,cognitive=5
function myFunction(x) {
  if (x > 0) {
    for (const item of items) {
      process(item);
    }
  }
}
```

Add fixtures to `tests/fixtures/` organized by file type (e.g., `js/`, `ts/`, `jsx/`, `vue/`).
