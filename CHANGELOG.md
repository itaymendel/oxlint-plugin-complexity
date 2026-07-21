# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.6] - 2026-07-21

### Changed

- Bump @oxlint/plugins from 1.73.0 to 1.74.0 (#143)
- Bump oxlint from 1.73.0 to 1.74.0 (#145)
- Bump oxc-parser from 0.139.0 to 0.140.0 (#147)
- Bump typescript from 6.0.3 to 7.0.2 (#148)
- Bump @types/node from 22.20.0 to 22.20.1 (#144)
- Bump tsx from 4.23.0 to 4.23.1 (#146)
- Bump prettier from 3.9.4 to 3.9.6 (#150)
- Bump actions/setup-node from 6 to 7 (#142)

## [2.1.5] - 2026-07-08

### Changed

- Bump @oxlint/plugins from 1.69.0 to 1.73.0 (#141)
- Bump oxlint from 1.69.0 to 1.73.0 (#141)
- Bump oxc-parser from 0.135.0 to 0.139.0 (#141)
- Bump prettier from 3.8.3 to 3.9.4 (#141)
- Bump tsx from 4.22.4 to 4.23.0 (#141)
- Bump vitest from 4.1.8 to 4.1.10 (#141)
- Bump @types/node from 22.19.21 to 22.20.0 (#132)
- Bump actions/checkout from 6 to 7 (#130)

## [2.1.4] - 2026-06-12

### Changed

- Bump @oxlint/plugins from 1.66.0 to 1.69.0 (#118)
- Bump oxlint from 1.66.0 to 1.69.0 (#119)
- Bump oxc-parser from 0.132.0 to 0.135.0 (#116)
- Bump @types/node from 22.19.19 to 22.19.20 (#117)
- Bump tsx from 4.22.3 to 4.22.4 (#114)
- Bump vitest from 4.1.7 to 4.1.8 (#112)

### Internal

- Add npm publish workflow: pushing a `vX.Y.Z` tag publishes to npm via trusted publishing (OIDC) with provenance and creates a GitHub Release

## [2.1.3] - 2026-05-24

### Fixed

- Move `@oxlint/plugins` from peerDependency to dependency so it installs automatically with the plugin (#102, #107)

### Changed

- Bump @oxlint/plugins from 1.62.0 to 1.66.0
- Bump oxlint from 1.62.0 to 1.66.0
- Bump oxc-parser from 0.128.0 to 0.132.0
- Bump tsx from 4.21.0 to 4.22.3
- Bump vitest from 4.1.5 to 4.1.7
- Bump @types/node from 22.19.17 to 22.19.19

## [2.1.2] - 2026-04-29

### Changed

- Bump oxlint from 1.56.0 to 1.62.0
- Bump @oxlint/plugins from 1.56.0 to 1.62.0
- Bump oxc-parser from 0.123.0 to 0.128.0
- Bump vitest from 4.1.0 to 4.1.5
- Bump prettier from 3.8.1 to 3.8.3
- Bump diff from 8.0.4 to 9.0.0
- Bump @types/node from 22.19.15 to 22.19.17
- Bump typescript from 5.9.3 to 6.0.3
- Bump pnpm/action-setup from 5 to 6
- Bump pnpm (packageManager) from 10.26.2 to 10.33.2

## [2.1.1] - 2026-04-03

### Fixed

- Include README.md in published npm package

## [2.1.0] - 2026-04-03

### Added

- Standalone library API (`analyzeFileComplexity`) and git diff analysis (`analyzeDiffComplexity`) for programmatic use without the oxlint runtime

### Changed

- Bump oxlint from 1.56.0 to 1.58.0
- Bump oxc-parser from 0.120.0 to 0.123.0
- Bump @oxlint/plugins from 1.56.0 to 1.58.0
- Bump vitest from 4.1.0 to 4.1.2
- Bump pnpm/action-setup from 4 to 5

## [2.0.3] - 2026-03-18

### Changed

- Bump oxc-parser from 0.116.0 to 0.120.0
- Bump @oxlint/plugins from 1.51.0 to 1.56.0
- Bump oxlint from 1.51.0 to 1.56.0
- Bump vitest from 4.0.18 to 4.1.0
- Bump @types/node from 22.19.13 to 22.19.15

## [2.0.2] - 2026-03-07

### Changed

- Bump oxc-parser from 0.115.0 to 0.116.0
- Bump @oxlint/plugins from 1.50.0 to 1.51.0
- Bump oxlint from 1.50.0 to 1.51.0
- Bump @types/node from 22.19.11 to 22.19.13
- Bump actions/upload-artifact from 6 to 7

## [2.0.1] - 2026-02-25

### Changed

- Bump oxc-parser from 0.114.0 to 0.115.0
- Bump @oxlint/plugins from 1.48.0 to 1.50.0
- Bump oxlint from 1.48.0 to 1.50.0

## [2.0.0] - 2026-02-17

### Changed

- Migrate plugin imports from `oxlint/plugins` to standalone `@oxlint/plugins` package (fixes compatibility with oxlint >= 1.45.0)
- **BREAKING:** `enableExtraction` now defaults to `true` — extraction suggestions are on by default (set `enableExtraction: false` to opt out)

### Added

- Performance optimization: `minLines` option to skip complexity analysis for small functions. Default: 10 lines.
- Export `createCombinedComplexityVisitor` and `CombinedComplexityResult` from public API

### Removed

- **BREAKING:** Drop deprecated `complexity/max-cyclomatic` and `complexity/max-cognitive` rules — use `complexity/complexity` instead

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

[Unreleased]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.1.5...HEAD
[2.1.5]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.1.4...v2.1.5
[2.1.4]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.0.3...v2.1.0
[2.0.3]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v1.0.0...v2.0.0
[1.0.0-rc.1]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.3.2...v1.0.0-rc.1
[0.3.2]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/itaymendel/oxlint-plugin-complexity/releases/tag/v0.1.1
