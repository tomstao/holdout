# 0001. Build on the DeepSpace scaffold as it comes

**Status:** Accepted, 2026-11-19

## Context

The exercise is judged partly on using "platform primitives instead of reimplementing
them without a reason". `npm create deepspace@0.44.2` gives a Vite + React 19 client
with file-based routes (generouted), a Hono Worker, Durable Object rooms (records, cron,
jobs, presence, Yjs, canvas), Better Auth sign-in, a Base UI primitives kit, Vitest,
Playwright through `deepspace test`, and npm. The official skill says to extend the
scaffold rather than assemble the runtime by hand, and where things live: schemas in
`src/schemas.ts` and `src/schemas/`, routes in `src/pages/`, providers in
`src/pages/(app)/_layout.tsx`, Durable Object wiring in `worker.ts`.

## Decision

Keep the scaffold's stack and file locations. Frontend: React with generouted routes,
Tailwind v4 and the scaffold's Base UI kit, restyled with an own theme. Backend: the Hono
Worker with DeepSpace server actions, one `RecordRoom`, the `CronRoom` and the `JobRoom`.
Package manager: npm (the scaffold's lockfile; the deploy path's `npm ci`). New code goes
in new folders (`src/domain`, `src/contracts`, `src/client`, `src/features`) with the
boundaries in [architecture.md](../architecture.md#layers-and-folders).

## Consequences

- No second framework, ORM, router or state library. Server state is the SDK's live
  records; local UI state is React state.
- Scaffold files we have not rewritten are listed in `eslint.config.js`
  (`SCAFFOLD_FILES`) and linted less strictly, so `deepspace app update` guides apply to
  them cleanly.
- The scaffold's AI agent tools stay registered: they run as the calling user under RBAC,
  so they cannot reach closed collections (tested, see [testing.md](../testing.md)).

## Alternatives considered

- **pnpm** (used in another project of the owner's): the scaffold supports it, but the
  docs, the deploy path and the example apps use npm. No gain for the risk.
- **TanStack Router or Query**: duplicate what generouted and the SDK's record hooks do.
