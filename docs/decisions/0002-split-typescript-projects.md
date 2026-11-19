# 0002. Three TypeScript projects and stricter flags

**Status:** Accepted, 2026-11-19

## Context

The scaffold has one `tsconfig.json` with both the DOM and the Workers types loaded, over
`src` and `worker.ts`. So browser APIs type-check in Worker code (and fail at runtime),
and config files and Playwright specs are not type-checked at all. The app parses CSV
rows and columns, where an index that may be missing is the most likely bug.

## Decision

- `tsconfig.json` is a solution file over three projects, all extending
  `tsconfig.base.json`; `npm run type-check` is `tsc -b`.
  - `tsconfig.app.json`: everything in `src` except Worker folders; DOM lib, Vite types.
  - `tsconfig.worker.json`: `worker.ts`, actions, server, AI, cron, jobs, plus the shared
    `schemas`, `contracts` and `domain`; ES2022 lib only and Workers types, no DOM.
  - `tsconfig.node.json`: Vite/Vitest configs, prerender, Playwright specs, scripts.
- Shared code is compiled by both runtime projects, so it cannot use an API only one of
  them has.
- Extra flags: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `moduleDetection: force`.
- Not enabled: `noImplicitReturns` (it flags React effects with a conditional cleanup and
  Hono middleware), `exactOptionalPropertyTypes` (fights the SDK's types).
  `noUncheckedIndexedAccess` is off in the node project only, where the Playwright fixture
  returns arrays you destructure by count.

## Consequences

- Two scaffold lines changed to pass the flags (type-only imports in `Modal.tsx`, an
  indexed loop in `chat-routes.ts`); `tsc -b` is clean.
- Code that only one runtime may use must live in that runtime's folders.

## Alternatives considered

- **Keep one project and rely on lint rules** for runtime boundaries: lint can ban
  imports, but not a stray `window` or `document`; the compiler can.

## Addendum, 2026-11-19

`tsconfig.node.json` now also includes `src/domain`. The demo generator's test
(`scripts/demo/demo.test.ts`) runs its output through `validateDataset`, and a composite
project may only import files it lists (TS6307). The domain is plain TypeScript with no
DOM or Worker types, so it compiles in both projects. ESLint still checks the domain
with the app project's stricter flags, because that project comes first in the root
`tsconfig.json`.
