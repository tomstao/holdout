# AGENTS.md

Holdout: small Kaggle-style prediction competitions on DeepSpace. A host uploads data and
a hidden answer key, participants upload predictions, the server scores them, a live
leaderboard updates, and at the deadline a private leaderboard decides.

## Read first

1. **The official DeepSpace skill**, `.claude/skills/deepspace/SKILL.md`
   (pinned in `skills-lock.json`). <https://docs.deep.space> is the authority; when the
   docs and the installed SDK disagree, `node_modules/deepspace/dist/*.d.ts` and the CLI's
   `--help` win.
2. **[docs/README.md](docs/README.md)**: spec, architecture, decisions, design, plan.
3. **[docs/plan.md](docs/plan.md)** is the task list, and
   **[docs/lessons.md](docs/lessons.md)** lists the gotchas already found. Read both before
   starting work.

## Commands

| Command                              | What it does                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `npm run check`                      | The gate: Prettier check, ESLint, `tsc -b`, layer rules, unit tests with coverage |
| `npm run validate`                   | `tsc -b` and unit tests (the pre-push hook)                                       |
| `npm run test:watch`                 | Vitest in watch mode                                                              |
| `npm run lint:fix`, `npm run format` | Fix what can be fixed automatically                                               |
| `npm run design:gate`                | DeepSpace product-polish checks (fails until the design phase)                    |
| `npx deepspace dev start`            | Local app (needs login and a registered app)                                      |
| `npx deepspace test run all`         | Playwright specs (needs login and test accounts)                                  |

## Where code goes

Enforced by ESLint and dependency-cruiser; details in
[docs/architecture.md](docs/architecture.md#layers-and-folders).

| Folder                                                                   | Holds                                                      | May import                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `src/domain/`                                                            | Pure logic: CSV, validation, metrics, split, ranking, time | Only `src/domain`. No packages, no `Date.now`, no `Math.random` |
| `src/contracts/`                                                         | Zod contracts for actions and records; the wire protocol   | `zod`, `deepspace/schema` types, `src/domain`                   |
| `src/schemas.ts`, `src/schemas/`                                         | DeepSpace `CollectionSchema`s: columns and RBAC            | `deepspace/schema`                                              |
| `src/actions/`, `src/cron.ts`, `src/jobs.ts`, `src/server/`, `worker.ts` | Worker code                                                | `deepspace/worker`, contracts, domain, schemas                  |
| `src/client/`, `src/features/`, `src/pages/`, `src/components/`          | Browser code                                               | `deepspace`, contracts, domain, `@/components/ui`               |

## How to add a server action

1. Contract in `src/contracts/` with `defineAction({ description, input, output })`;
   register it in `actionContracts` (`src/contracts/actions.ts`).
2. Handler in `src/actions/<name>.ts`: `implement(contract, handler)`. The handler gets
   `{ input, userId, tools }` and returns `ok(data)` or `fail(code, message, issues?)`.
3. Add it to `handlers` in `src/actions/index.ts`. The compiler refuses a missing or
   extra one.
4. Call it from the browser with `callAction('<name>', input)`.
5. Unit-test the handler with `fakeRoom()` from `src/actions/fakes.ts`; take the clock, ids
   and anything from the platform as dependencies, as `create-competition.ts` does. Add the
   failure cases to `tests/api.spec.ts`.

## How to add a collection

1. `src/schemas/<name>-schema.ts`: columns and permissions. Clients get read access at
   most; writes go through actions. Secret data gets every role, including `'*'` and
   `admin`, set to all `false`.
2. Its Zod contract in `src/contracts/`, registered in `recordSchemas`
   (`src/contracts/records.ts`).
3. Add the schema to `src/schemas.ts`. `schema-drift.test.ts` fails until the two match.
4. Read it with `useCollection('<name>', query)` in the browser and `typedRecords(tools)`
   in the Worker.

## Rules

- **Never open `answer_keys` or `private_scores` to any role,** and never return their
  fields from an action. `tests/rbac.spec.ts` guards this.
- **No client writes.** Every collection grants clients read at most; writes go through
  actions.
- **Actions run with RBAC off.** Check the caller's rights yourself (for example
  `competition.hostId === userId`). Take identity only from `userId`, never from input.
- **Time and randomness are arguments in `src/domain`.** Actions, cron and jobs read the
  clock and pass `now` in.
- **Cron tasks and jobs must be safe to run early and twice.** Members can trigger them,
  and they can be retried.
- **No paid integration calls in tests.**
- **Source control and deploys:** the app ships from GitHub
  ([ADR 0014](docs/decisions/0014-source-control-github.md)). Never run
  `npx deepspace push`; run `npx deepspace deploy` only when the owner asks, from a clean,
  pushed `main`.
- **Commits:** Conventional Commits, one topic per commit and per pull request, small
  enough to review. Hooks must pass; never `--no-verify`.
- **`main` is protected,** for the owner too. Every change arrives through a pull request
  whose `quality` check has passed and whose review conversations are resolved. History
  is linear: merge with "Rebase and merge" (or squash), never a merge commit. No direct
  pushes, force pushes or deletion. Base each pull request on `main`; if one must build
  on another, see [docs/lessons.md](docs/lessons.md) for what stacking costs.
- **Docs move with code:** update the spec, architecture or decision a change touches in
  the same pull request; tick [docs/plan.md](docs/plan.md); add new gotchas to
  [docs/lessons.md](docs/lessons.md).
- **Scaffold files:** files listed in `SCAFFOLD_FILES` (`eslint.config.js`) are the
  generated originals. When you rewrite one as ours, remove it from the list so it gets
  the strict rules.
- **UI:** use `src/components/ui` primitives and theme tokens, never browser defaults or
  hardcoded colours ([docs/design/frontend.md](docs/design/frontend.md)).

## Done means

`npm run check` passes, the change is covered by tests at the right layer
([docs/testing.md](docs/testing.md)), and anything user-facing was looked at in the
running app. Report what was verified and what was not, separately.

## DeepSpace platform notes (from the scaffold)

Read <https://docs.deep.space/llms.txt>, then fetch the relevant documentation page as
Markdown by appending `.md`. The installed package types and CLI `--help` describe the
exact version in this project.

This is a **DeepSpace** app, built on the [`deepspace`](https://www.npmjs.com/package/deepspace)
SDK and deployed to Cloudflare Workers with `npx deepspace deploy`.

**Version control.** An app has one source authority, latched permanently by its first
release: DeepSpace's cloud repo (commit-first deploys, `deepspace push`) or GitHub
(deploys ship the current checkout, including uncommitted bytes). This project ships from
GitHub ([ADR 0014](docs/decisions/0014-source-control-github.md)): never run `deepspace push`. Use `status`,
`activity`, `releases` and `rollback` to recover context and see what is live.

```sh
npx deepspace auth login   # authenticate
npx deepspace dev start    # local dev server (vite + miniflare)
npx deepspace agent tools <app> --json # discover app tools and their input schemas
npx deepspace agent invoke <app> <tool> --input-file tool-input.json --json
npx deepspace add --list   # optional features
```

`worker.ts` already exposes the tools from `src/ai/tools.ts` over HTTP, MCP and browser
tools; add tools there instead of registering routes again. For local app tools, run
`agent tools` first and follow the returned description and input schema rather than
guessing arguments. `agent invoke` reuses the current CLI login. If it reports
`not_authenticated`, run the refusal's action when present; never invent credentials or
put a password on the command line.
