# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Performance optimization: `minLines` option to skip complexity analysis for small functions. Default: 10 lines.

## [1.0.0-rc.1] - 2026-02-08

### Added

- **New `complexity/complexity` rule** - Optimized rule that checks both cyclomatic and cognitive complexity in a single AST walk (17% faster than separate rules)
- Export extraction analysis types and functions from public API
- Test fixtures for Svelte (`.svelte`) and Astro (`.astro`) files
- Documented framework support: React, Vue, Angular, Svelte, Astro, Solid, Qwik

### Changed

- Clean up unused parameters left over from v0.3.2 refactoring across internal APIs

### Deprecated

- `complexity/max-cyclomatic` - Use `complexity/complexity` instead
- `complexity/max-cognitive` - Use `complexity/complexity` instead

### Fixed

- Detect `this` references in extraction candidates and flag as medium-confidence issue.
- Detect mutating method calls (`push`, `sort`, `set`, `delete`, etc.) as variable mutations in extraction analysis.
- Strengthen extraction tests: replace weak/guarded assertions with exact values and rewrite inline fixtures that produced zero candidates.
- Fix `hasEarlyReturn` to use AST-based detection.
- Fix `suggestFunctionName` producing incorrect names; replaced with `"extracted"` placeholder.
- Fix exported `MaxCognitiveOptions` type missing extraction and tip-threshold options added in v0.3.0.

## [0.3.2] - 2026-02-01

### Changed

- Refactored variable tracking to use oxlint's built-in scope APIs
- Removed `reference-utils.ts` in favor of oxlint's `Reference.isRead()/isWrite()` methods
- Removed visitor merging logic in `cognitive/visitor.ts`

## [0.3.1] - 2026-01-27

### Changed

- Bump oxc-parser from 0.108.0 to 0.111.0
- Bump oxlint from 1.39.0 to 1.42.0
- Bump prettier from 3.7.4 to 3.8.1
- Bump vitest from 4.0.17 to 4.0.18

## [0.3.0] - 2026-01-19

### Added

- Refactoring tips for common complexity patterns (deep nesting, else-if chains, logical operators)
- Configurable tip thresholds (`nestingTipThreshold`, `elseIfChainThreshold`, `logicalOperatorThreshold`)
- Smart extraction suggestions with variable flow analysis (opt-in via `enableExtraction: true`)

### Changed

- Bump oxc-parser from 0.107.0 to 0.108.0
- Bump oxlint from 1.38.0 to 1.39.0
- Bump vitest from 4.0.16 to 4.0.17

## [0.2.0] - 2026-01-13

### Added

- Complexity breakdown in error messages inspired by jfmengels, with top offender marker

## [0.1.4] - 2026-01-13

### Changed

- Bump oxlint from 1.35.0 to 1.38.0
- Bump oxc-parser from 0.105.0 to 0.107.0

## [0.1.3] - 2025-12-15

### Changed

- Updated dependencies
- Setup Dependabot for automated dependency updates

## [0.1.2] - 2025-12-01

### Changed

- Updated GitHub Actions workflows

## [0.1.1] - 2025-11-15

### Added

- Initial release
- Cyclomatic complexity rule (`complexity/max-cyclomatic`)
- Cognitive complexity rule (`complexity/max-cognitive`)
- Support for `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.jsx`, `.vue` files
- Programmatic API for custom tooling
- GitHub Actions CI pipeline
- Pre-commit hooks with Husky

[Unreleased]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.3.2...v1.0.0-rc.1
[0.3.2]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/itaymendel/oxlint-plugin-complexity/releases/tag/v0.1.1
