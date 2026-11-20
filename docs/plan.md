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
needed. S8 was run on 2026-11-20, with the close-out email: both copies arrived.

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
      my submissions. The Edit tab came in PR 14, the viewer's pinned row in PR 15.
- [x] **PR 10, multi-user spec:** two participants in two browsers; B's page shows A's new
      row without a reload; the daily limit refuses the next submission with the reset time.
      In `collab.spec.ts`, with a host as the third account; it also checks the reorder and
      the tie-break live.

## Day 4: the close and the design

- [x] **PR 11, close:** `domain/ranking.ts` final selection and standings; cron task and
      job per [ADR 0009](decisions/0009-close-with-cron-and-a-job.md); final standings view
      with shake-up. Spec: a competition due in 45 seconds closes on its own. Standings are
      written 20 at a time.
- [x] **PR 11b, close-out email:** spike S8 first (one send with `bcc` and `reply_to` to
      two of the owner's inboxes; both arrived), then the email from the job, sent once
      at most and never from a local run
      ([ADR 0012](decisions/0012-integrations-email-only.md#built-2026-11-20)). It goes to
      the host alone: with participants in `bcc` each of them was shown the host's
      address, so the owner changed it before it was ever deployed
      ([ADR 0017](decisions/0017-close-email-to-the-host-alone.md)). Not yet seen on the
      live site: it needs a competition hosted by a real account to close there.
- [x] **PR 12, design**, in three parts so each can be reviewed on its own:
  - [x] **12a, theme and chrome:** the Holdout theme with an AA check, IBM Plex served by
        the app, the wordmark and favicon, Navigation
        ([ADR 0015](decisions/0015-theme-status-colours-and-self-hosted-fonts.md)).
  - [x] **12b, `/home`:** the competition list with its declared pattern (spec F6).
  - [x] **12c, landing:** the static page with its Design Direction block; `design:gate`
        added to `npm run check`.
- [x] **PR 13, demo competition:**
  - [x] **13a, the files:** `scripts/demo/make-demo.ts` shuffles, renumbers and splits
        Palmer Penguins into train, test and solution files. Its test runs them through
        the app's dataset rules.
  - [x] **13b, on production:** the owner ran the script; the competition was created at
        `/host/new` in the owner's browser on 2026-11-19 (release #5):
        <https://holdout.app.space/c/ff94aae4-8438-4ed6-a3c4-37bbd7850ca2>, "Palmer
        Penguins (practice)", classification by accuracy, 136 test rows of which 41 are
        public, closing 2027-02-17 02:00 UTC. Checked signed out: the title, Open, the
        countdown, an empty leaderboard, the three downloads (train, test, sample
        submission), and no route to the answers (404).
  - [x] **13c:** the landing's first button opens it ("Try the demo competition") in a
        production build; any other build keeps "See the competitions" and `/home`
        (`src/demo.ts`). Live since release #6.

- [x] **PR 14, edit (F5):** `updateCompetition` (host only, while open; a deadline only
      moves later), the Edit tab with a confirmation for the deadline, and the close job
      opening a competition again if its deadline moved as it was being marked.

- [x] **PR 15, the viewer's own row:** it stays in sight on a long leaderboard and in the
      final standings (pinned to the edge of the page while its place is off screen), and
      a polite live region speaks the viewer's rank when it changes.

## Day 5: verify, review, ship

- [ ] DeepSpace's six verification gates
      ([building an app](https://docs.deep.space/guides/building-an-app.md), step 6):
      `npm run check` and `npx deepspace test run all`; screenshots of every changed
      screen; side by side with `docs/design/refs/`; the core loop on the deployed app with
      a fresh test account; two real sessions for the leaderboard; every failure state
      (invalid file, limit reached, closed, signed out, not found).
      Done on 2026-11-20: the check and all 41 specs; the core loop, two sessions and
      every failure state on the deployed app (the walk-through below). Not done, so the
      box stays open: the side-by-side, because the reference screenshots were never
      taken; the screens were looked at in the specs' screenshots instead.
- [x] Independent review by a fresh agent context of the actions, RBAC and the close;
      adjudicate each finding against the code. Done 2026-11-19; the findings and what
      was done about each are in the table below.
- [x] Walk the spec's acceptance criteria one by one on production. Done 2026-11-20 with
      `tests/live/acceptance.live.ts` and three test accounts, at the owner's word; the
      results are in the table below.
- [ ] README and [submission-notes.md](submission-notes.md) finished; deploy from a clean
      `main`; tag `v1.0.0`.

### Releases

A GitHub-source release records no commit, so this table is the record. Add a row with
each deploy.

| Release | When (UTC)       | Code                                                         | Checked on the live site                                                                                                                                                                                                                                                                           |
| ------- | ---------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1      | 2026-11-19 16:30 | The scaffold                                                 | It loads                                                                                                                                                                                                                                                                                           |
| #2, #3  | 2026-11-19 17:38 | The day-1 spikes, then rolled back to #1                     | Spikes S1 to S7 ([lessons](lessons.md))                                                                                                                                                                                                                                                            |
| #4      | 2026-11-19 21:59 | `main` at `6d09dec`, from a folder with two uncommitted docs | As a visitor: landing, empty list, not-found, sign-in gate; no console errors; the close task runs every minute                                                                                                                                                                                    |
| #5      | 2026-11-19 22:46 | `main` at `2c2b17a`, from a clean `main`                     | The review's fixes: every `/ws` path but the app's room is 404; integrations and agent tools 404; upload 405; a visitor's write to `canvas-settings` refused; the list still loads                                                                                                                 |
| #6      | 2026-11-20 02:34 | `main` at `a2c5657`, from a clean `main`                     | The landing's first button reads "Try the demo competition" and opens the demo; the smoke spec passes against the live site, signed out (10 of 10); the close task ran after the deploy; no errors in the logs                                                                                     |
| #7      | 2026-11-20 03:29 | `main` at `21af317`, from a clean `main`                     | The smoke spec passes against the live site, signed out (10 of 10); no errors in the logs; the close task ran four seconds after the deploy; the walk-through competition closed on its own 30 seconds after its deadline and the new email step logged `"email":"none"` for its test-account host |

Signed in, on release #5: the owner's browser created the demo competition and saw its
page as the host. Not checked on any release: editing a competition (F5), and the write
probes against the closed collections, which pass locally and would leave a row on the
live site if one ever succeeded.

### The acceptance walk-through, 2026-11-20

On the deployed app, with the Alice, Bob and Carol test accounts and a signed-out
browser. It left one competition there for good:
<https://holdout.app.space/c/25d0644f-d1a8-4468-9153-9ff598910a16>, "[TEST] Acceptance
walk-through 2026-11-20T02:53Z", six rows, a daily limit of 2. Criteria 1 to 4 ran on
release #6; the competition closed on release #7.

| #   | Criterion                                                             | Result                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Create from three valid files; three bad ones say where               | Pass. The form named file, row and column for each bad file and kept Create disabled; the server refused one sent past the form; the competition was created through the form                                                                                                                                              |
| 2   | A valid file is scored; another open page shows the row               | Pass. Carol scored 0.3333; the row appeared on Bob's page and a visitor's without a reload, and Bob's on Carol's                                                                                                                                                                                                           |
| 3   | A bad file uses no slot; the file after the limit is refused          | Pass. `invalid_file` with row and column, the count stayed at 0 of 2; the third file got `limit_reached` and the page said when the count resets                                                                                                                                                                           |
| 4   | Nobody reads `answer_keys` or `private_scores`                        | Pass for reads: a visitor, both participants and the host were sent no row of either (a visitor and a participant again after the close), while the same socket delivered the public rows. The agent tools answer 404. A submission's answer has its five fields and no private score. The write probes were not run there |
| 5   | It closes on its own; every viewer gets the standings; the host email | Pass for the close: a page opened before the deadline went to Closed with no reload, 30 seconds after the deadline; a late file was refused; the public leader finished last ("Up 1 place", "Down 1 place") for a visitor, both participants and the host. The email: see below                                            |
| 6   | `npm run check`, the design gate and all specs pass                   | Pass, locally and in CI: 435 unit tests, 41 specs                                                                                                                                                                                                                                                                          |

The deadline has to be an hour ahead on a deployed app, not the two minutes criterion 5
names. The close job's line in the live log read
`{"status":"closed","participants":2,"submissions":3,"email":"none"}`: the host was a
test account, whose address mail cannot reach. The email itself is checked with a
competition hosted by the owner's account; its result is recorded with the final pass.

Also seen signed out on release #6: an unknown competition says so; `/host/new` and the
Submit tab ask for a sign-in; both actions answer 401 without a token.

### The independent review, 2026-11-19

A fresh agent, given the spec's guarantees and the code but none of the build's reasoning,
reported twelve findings. Each was checked against the code (and the SDK's built code)
before anything changed. "Confirmed" below is that check, not the reviewer's word.

| #   | Finding                                                                                    | Checked                                                                                                 | Done                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Any signed-in user can pause the close task through the cron socket                        | Confirmed in the SDK: `member` may write to a cron room                                                 | Route removed ([ADR 0016](decisions/0016-serve-only-what-the-app-uses.md))                                                                               |
| 2   | The agent tool route counts rows of a closed collection through a scan-cap error           | Confirmed in the SDK's query path                                                                       | Agent routes removed (ADR 0016)                                                                                                                          |
| 3   | A regression prediction that overflows the score leaves a submission with no private score | Confirmed: the record contract throws on a score that is not finite, and the throw skipped the clean-up | Numbers beyond 1e100 refused by row, for predictions and targets; a score that is not finite stores nothing; the submission is removed after any failure |
| 4   | Any signed-in user can call integrations on the owner's account                            | Confirmed in the Worker code; billing not tested                                                        | The proxy serves no integration (ADR 0016)                                                                                                               |
| 5   | Any room name is a room; each new cron room runs the close task forever                    | Confirmed: a first request initialises the room                                                         | One room, by name (ADR 0016)                                                                                                                             |
| 6   | The daily limit is checked after the expensive work                                        | Confirmed in the action's order of calls                                                                | Limit, then the file's own checks, then the answer key                                                                                                   |
| 7   | A predictions file's header is echoed whole in the error                                   | Confirmed: every column name was listed                                                                 | At most twelve names, as the dataset check already did                                                                                                   |
| 8   | Each step of the close job counts as an attempt                                            | Confirmed in the SDK's job room                                                                         | Enqueued with 12 attempts: six steps for 200 participants, six for failures ([ADR 0009](decisions/0009-close-with-cron-and-a-job.md), addendum)          |
| 9   | A signed-out socket can write to the built-in `canvas-settings` collection                 | Confirmed in the SDK: open to every role                                                                | Frames for built-in collections refused (ADR 0016)                                                                                                       |
| 10  | The file proxy takes uploads from any member                                               | Confirmed in the Worker code; the quota not tested                                                      | GET, HEAD and DELETE only (ADR 0016)                                                                                                                     |
| 11  | Every participant's file names are readable by anyone                                      | Confirmed: `fileName` is a column of the public row                                                     | Accepted for v1 and recorded ([ADR 0007](decisions/0007-derive-the-leaderboard-from-submissions.md)); hiding it needs an owner-only collection           |
| 12  | `scoreDecimals` only formats in the browser; the trust model claims more                   | Confirmed: the claim was wrong, the code is as the spec says                                            | The claim is removed from the trust model; ADR 0007 says what rounding is not                                                                            |

What the reviewer examined and found sound: the closed collections over the room's socket,
the action route's identity and output handling, the daily limit under concurrency, the
close logic, `updateCompetition`, and the domain code with the files route. Not reviewed:
browser code, `domain/listing.ts`, the platform's side, and nothing was run against a real
Worker.

## If behind schedule, cut in this order

1. F5 (editing a competition)
2. The public/final toggle on the closed leaderboard
3. The close-out email (the page still shows the results)
4. The landing hero animation (a static leaderboard instead)

Never cut: the closed answer key and its RBAC test, the private split, the automatic close.
