# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Refactoring tips for common complexity patterns (deep nesting, else-if chains, logical operators)
- Configurable tip thresholds (`nestingTipThreshold`, `elseIfChainThreshold`, `logicalOperatorThreshold`)

### Changed

- Removed unused `estree-walker` dependency

## [0.2.0] - 2025-01-13

### Added

- Complexity breakdown in error messages inspired by jfmengels, with top offender marker

## [0.1.4] - 2025-01-13

### Changed

- Bump oxlint from 1.35.0 to 1.38.0
- Bump oxc-parser from 0.105.0 to 0.107.0

## [0.1.3] - 2024-12-15

### Changed

- Updated dependencies
- Setup Dependabot for automated dependency updates

## [0.1.2] - 2024-12-01

### Changed

- Updated GitHub Actions workflows

## [0.1.1] - 2024-11-15

### Added

- Initial release
- Cyclomatic complexity rule (`complexity/max-cyclomatic`)
- Cognitive complexity rule (`complexity/max-cognitive`)
- Support for `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.jsx`, `.vue` files
- Programmatic API for custom tooling
- GitHub Actions CI pipeline
- Pre-commit hooks with Husky

[Unreleased]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/itaymendel/oxlint-plugin-complexity/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/itaymendel/oxlint-plugin-complexity/releases/tag/v0.1.1
