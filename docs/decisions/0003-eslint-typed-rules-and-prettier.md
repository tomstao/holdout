# 0003. Type-aware ESLint and Prettier, not Biome

**Status:** Accepted, 2026-11-19

## Context

Most code here will be written by a coding agent and reviewed by a person, so the checks
should catch what a reviewer misses: floating promises (cancelled when a Worker request
ends), unsafe `any`, non-exhaustive switches over unions, wrong layer imports, and the
design tells DeepSpace's product-polish guide lists. The scaffold ships ESLint with one
rule (React's rules of hooks) and runs it through `vite-plugin-checker`, which shows an
overlay in dev and fails the build. It ships no formatter. The owner's other project
(farmGame) uses Biome.

## Decision

- **ESLint 9, the one linter.** typescript-eslint `strictTypeChecked` +
  `stylisticTypeChecked` on our code; `recommendedTypeChecked` on the scaffold files we have
  not rewritten (with five known findings turned off and listed). React hooks including the
  React Compiler rules, jsx-a11y, and `no-restricted-syntax` rules for the mechanical
  product-polish checks: no browser dialogs, no native `<select>`, no hardcoded colours in
  class names, no pictograph emoji. Package-level layer bans (`no-restricted-imports`) and
  determinism in `src/domain` (`Date.now`, `Math.random` banned).
- **Prettier**, matching the scaffold's style (no semicolons, single quotes, width 100),
  with Tailwind class sorting. Formatting is Prettier's job only (`eslint-config-prettier`).
- **dependency-cruiser** for directory-level layers and runtime cycles, because it
  resolves real paths.
- The rest of the design gate that a linter cannot express is `npm run design:gate`.

## Consequences

- The same ESLint config runs in the editor, the dev overlay, `vite build` (so a lint
  error blocks a deploy), the pre-commit hook and CI.
- Type-aware linting is slower (a few seconds for this repo).
- Formatting the scaffold produced one formatting-only commit.

## Alternatives considered

- **Biome** (lint and format): fast and one tool, but its type-aware rules do not yet
  cover what `strictTypeChecked` does (`no-floating-promises`, `no-unsafe-*`,
  `switch-exhaustiveness-check`), and the scaffold's build already runs ESLint.
- **Biome for formatting, ESLint for lint**: two tools touching the same files for no
  real gain over Prettier.
