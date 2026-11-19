# Build plan

Five working days after the setup day. Each step is one small pull request the owner
reviews. Tick boxes as work lands; this file is the running task list
(DeepSpace, [building an app](https://docs.deep.space/guides/building-an-app.md): "state lives on disk").
Gotchas go to [lessons.md](lessons.md) the moment they are found.

## Day 0: setup (done 2026-11-19)

- [x] Research: domain and platform ([research/](research/))
- [x] Spec, architecture, decisions, frontend design brief
- [x] Scaffold (create-deepspace 0.44.2), official DeepSpace skill installed
- [x] Tooling: split tsconfigs, type-aware ESLint with product-polish rules, Prettier,
      dependency-cruiser, Vitest projects with coverage, lefthook + commitlint, CI
- [x] Typed contract layer (`defineAction`, `implement`, `callAction`, `useCollection`,
      schema drift check) with tests

## Before day 1: the owner's steps

Only the owner can do these: they need a browser login or are hard to reverse.

1. [x] `npx deepspace auth login`; `auth whoami` shows the owner's account (2026-11-19).
2. [x] Source mode: GitHub ([ADR 0014](decisions/0014-source-control-github.md), accepted).
       [x] Public repository <https://github.com/tomstao/holdout>, `origin`, `main` pushed.
3. [x] `npx deepspace app init`: registered `app_01M7T9QF5YQP70H5073J172J32`, id committed
       in `wrangler.toml`. The `holdout` subdomain is only claimed by the first deploy; if it
       is taken, change `name` in `wrangler.toml` and `APP_NAME` in `src/constants.ts`.
4. [x] `npx deepspace status --json` shows `sourceInference: "github"` (source not latched
       until the first deploy). Never run `deepspace push`.
5. [x] First deploy (release #1, 2026-11-19, run by the owner): live at
       <https://holdout.app.space>, GitHub source claimed. Checked: pages 200, actions 401
       without a token, unknown API 404, no errors in the logs.
6. [x] `npm run test:unit` now also runs the `app` Vitest project; `npm run build` works
       (both checked after registration).

## De-risking spikes (day 1)

Timebox: half a day in total, on a throwaway branch against the deployed app. Each result
goes into [lessons.md](lessons.md) and updates its decision's status.

| #   | Question                                                                                                  | Method                                                                   | Pass                                           | If it fails                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Does a 1.5 MB JSON record write and read through action tools?                                            | Action creates and gets a record with a 1.5 MB `rows` array              | Round trip intact, under 1 s                   | Chunk the key across records ([0006](decisions/0006-answer-key-in-a-server-only-collection.md))                                   |
| S2  | Can an action parse and score 50,000 rows within the CPU budget?                                          | Score a generated 2 MB file in an action; read `logs` for `exceededCpu`  | No CPU errors, response under 2 s              | Score in a job with restricted reads ([0010](decisions/0010-score-inside-the-submit-action.md))                                   |
| S3  | Can member B overwrite or delete member A's `app`-scope file? Can the Worker stream a host's `self` file? | Two test accounts with `useR2Files`; `appFiles(...).download` in a route | B is refused; download streams                 | Keep the route design; if B is refused, simplify to `app` scope ([0011](decisions/0011-datasets-in-host-files-behind-a-route.md)) |
| S4  | What does `tools.create` return when `uniqueOn` refuses?                                                  | Two concurrent creates with the same composite key                       | One succeeds; the other's code is identifiable | Detect by message; or serialise the claim in a job ([0008](decisions/0008-daily-limit-with-uniqueon-slots.md))                    |
| S5  | How many record writes fit in one cron run or job step?                                                   | A job writing 200 records with and without `ctx.continue`                | 200 writes across chunks of 40                 | Smaller chunks ([0009](decisions/0009-close-with-cron-and-a-job.md))                                                              |
| S6  | How many rows does one `useQuery` subscription return?                                                    | Seed 5,000 small rows; subscribe with `limit: 5000`                      | All rows arrive and live updates flow          | Page in the hook, or keep a per-participant best row ([0007](decisions/0007-derive-the-leaderboard-from-submissions.md))          |
| S7  | Does `enqueueJob` from Worker code bypass `authorizeWrite`?                                               | Set `authorizeWrite` to refuse everyone; enqueue from the cron task      | The job runs; clients cannot enqueue           | Allow `admin` only                                                                                                                |
| S8  | Does `email/send` from a job deliver with `bcc` and `reply_to`?                                           | One send to two owner-controlled addresses                               | Both arrive, neither sees the other            | Send one message per recipient (cost × n)                                                                                         |

Results (2026-11-19, locally and on the deployed app):
[lessons.md](lessons.md#2026-11-19-day-1-spikes-s1-to-s8). S1 to S7 pass and no fallback is
needed. S8 moved to day 4, where the close-out email is built.

## Day 1: domain core

- [x] **PR 1, spikes S1 to S7** (throwaway branch `spike/day-1`; results only, no app code
      merged). Run locally and once on the deployed app (release #2). S8 moved to PR 11.
- [x] **PR 2, `domain/csv.ts`:** RFC 4180 parser (BOM, CRLF, quoted commas, quotes and
      newlines, trailing newline), header lookup, byte and row limits. Property test:
      formatting rows and parsing them back gives the same rows.
- [x] **PR 3, `domain/metrics.ts`:** accuracy, macro-F1, RMSE, MAE and their direction.
      Fixtures with expected values computed once by scikit-learn
      (`scripts/fixtures/metrics.py`, output committed as JSON) and asserted to 1e-12.
- [x] **PR 4, `domain/split.ts` and `domain/dataset.ts`:** `Usage` parsing; deterministic,
      label-stratified split from a seed; train/test/solution validation with
      file-row-column issues; sample submission. Property tests: the split is a partition,
      is stable for a seed, and keeps every class in both halves when it has two or more
      rows.

## Day 2: data model and creating competitions

- [x] **PR 5, schemas, record contracts and RBAC:** five collections in `src/schemas/`, their
      Zod contracts in `src/contracts/competitions.ts`, registered; drift test green.
      The answer key keeps its `[id, target, split]` rows and its 1.5 MB limit
      ([ADR 0006](decisions/0006-answer-key-in-a-server-only-collection.md#encoding-settled-2026-11-19)).
      Playwright `rbac.spec.ts`: a visitor and a member can create nothing in any
      collection. The room answers an empty collection and a closed one alike, so the
      read half of the spec waits for PR 6, which can create rows.
- [x] **PR 6, `createCompetition` and the files route:** action contract and handler,
      files to the host's `self` folder, `GET /api/competitions/:id/files/:kind`. API spec
      for invalid input, invalid files and success. `rbac.spec.ts` extended: once a
      competition exists, a visitor, another member and the host are sent no row of its
      answer key, cannot change or delete it, and learn nothing by guessing. Not covered:
      the same reads through the agent tools, which need an agent token.
- [x] **PR 7, `/host/new`:** form with kit components, three file drops validated locally
      with the same domain code, issues shown per file; redirect on success. It lands on
      a first `/c/:id` (header, rules, downloads), which PR 9 replaces with the full page.

## Day 3: submitting and the live leaderboard

- [x] **PR 8, `submitPredictions`:** `domain/predictions.ts` and `domain/scoring.ts`;
      host refused; deadline check; slot claim with `uniqueOn` and one retry; private score
      written second, submission removed if that fails. The race is tested against the real
      room (`submit.spec.ts`): with a limit of 1, two simultaneous submissions give one score.
- [x] **PR 9, `/c/:id`:** header and tabs; Leaderboard from `useCollection('submissions')`
      and `domain/ranking.ts`; Overview; Data with downloads; Submit with local check and
      my submissions. Not yet: the viewer's row pinned when it is below the fold (a line
      above the table gives their rank instead), and the Edit tab (F5).
- [x] **PR 10, multi-user spec:** two participants in two browsers; B's page shows A's new
      row without a reload; the daily limit refuses the next submission with the reset time.
      In `collab.spec.ts`, with a host as the third account; it also checks the reorder and
      the tie-break live.

## Day 4: the close and the design

- [x] **PR 11, close:** `domain/ranking.ts` final selection and standings; cron task and
      job per [ADR 0009](decisions/0009-close-with-cron-and-a-job.md); final standings view
      with shake-up. Spec: a competition due in 45 seconds closes on its own. Standings are
      written 20 at a time.
- [ ] **PR 11b, close-out email:** first spike S8 (one send with `bcc` and `reply_to` to two
      owner-controlled addresses), then the email from the job, outside test mode. Needs
      the owner's two addresses. First in the cut order below.
- [ ] **PR 12, design:** Holdout theme, Navigation, `/home` with its declared pattern, the
      landing with its Design Direction block; `design:gate` added to `npm run check`.
- [ ] **PR 13, demo competition:** script that shuffles and renumbers Palmer Penguins into
      train/test/solution files (`scripts/demo/`), then created through `/host/new` on
      production.

## Day 5: verify, review, ship

- [ ] DeepSpace's six verification gates
      ([building an app](https://docs.deep.space/guides/building-an-app.md), step 6):
      `npm run check` and `npx deepspace test run all`; screenshots of every changed
      screen; side by side with `docs/design/refs/`; the core loop on the deployed app with
      a fresh test account; two real sessions for the leaderboard; every failure state
      (invalid file, limit reached, closed, signed out, not found).
- [ ] Independent review by a fresh agent context of the actions, RBAC and the close;
      adjudicate each finding against the code.
- [ ] Walk the spec's acceptance criteria one by one on production.
- [ ] README and [submission-notes.md](submission-notes.md) finished; deploy from a clean
      `main`; tag `v1.0.0`.

## If behind schedule, cut in this order

1. F5 (editing a competition)
2. The public/final toggle on the closed leaderboard
3. The close-out email (the page still shows the results)
4. The landing hero animation (a static leaderboard instead)

Never cut: the closed answer key and its RBAC test, the private split, the automatic close.
