# Lessons

Gotchas and wrong assumptions, written down the moment they are found so no session or
agent repeats them. Newest at the bottom. Each entry: what happened, what to do instead.

## 2026-11-19, setup

**DeepSpace platform**

- **The docs lag the SDK.** The docs are stamped 0.43.0; the installed SDK is 0.44.2.
  `tools.update` is a shallow merge (the old example apps say full replace), and
  `records.query` pages with `offset`/`nextOffset` (the docs say no pagination). Per the
  official skill, `node_modules/deepspace/dist/*.d.ts` and the CLI's `--help` win.
- **The live integration catalog beats the guides.** `email/send` always sends from
  `notifications@updates.app.space`; the guide's `<app>@app.space` is out of date. Check
  `npx deepspace integrations info <endpoint>` before relying on a guide's example.
- **The scaffold does not register the app, and committing first changes how you
  register.** With the `__APP_ID__` placeholder committed, first use no longer registers;
  run `npx deepspace app init`.
- **`vite build` and the scaffold's Vitest config refuse to load without a registered app
  id.** Unit tests that need no platform identity run in Vitest's `pure` project, so they
  work before registration and in CI.
- **Uploads to app files return 401 locally until the app has been deployed once.**
- **`app init` registers the id but does not claim the subdomain;** the first deploy
  does, so a taken name only shows up then. `app init` also suggests a commit message
  (`Register app_…`) that commitlint rejects; use a Conventional Commit.
- **A deploy syncs secrets from `.dev.vars` and removes live secrets that are not
  there** ("this deploy ships no user secrets and removes any live on the app"). Read
  the secrets guide before adding the first secret.
- **The agent's permission check blocks `npx deepspace deploy`** (hard to reverse,
  outward-facing). The owner runs deploys (`! npx deepspace deploy` in Claude Code);
  most spikes and all tests can run locally with `npx deepspace dev start`.
- **`vite build` runs the type-aware ESLint through `vite-plugin-checker`** (about 9 of
  the build's 10 seconds); a lint error fails the build and so the deploy.
- **Members can trigger cron tasks, enqueue jobs and read job payloads and results by
  default.** Design every task and job to be safe when run early, and never put private
  data in a job row.
- **There is no atomic read-modify-write on records.** Use `uniqueOn` (refused duplicates)
  or derive state from insert-only rows; a JobRoom serialises its handlers.

**Tooling**

- **ESLint flat config globs are minimatch:** escape `[...all]` as `\\[...all\\]` and
  match the `(app)` route group with `?app?`.
- **The product-polish colour rule must allow `shadow-[...rgba()]`:** DeepSpace's theme
  docs prescribe literal shadows, and the scaffold's Dialog uses one.
- **typescript-eslint and `tsc` can disagree on an empty registry:** the linter calls
  an `as` assertion inside `Object.entries()` unnecessary, the compiler needs it.
  Annotate a variable (`const r: T = x`) instead of asserting.
- **Composite TypeScript projects refuse imports from outside the project (TS6307).** Code
  both runtimes need, such as the action client's wire protocol, lives in
  `src/contracts`.
- **dependency-cruiser 18 has no `extensionAlias` option;** the Worker's `.js`
  specifiers resolve to `.ts` through `tsConfig` anyway.
- **Lefthook's npm postinstall writes a commented example `lefthook.yml`** when none
  exists. Replace it; do not commit the example.

**This Windows machine**

- **`core.autocrlf=true` globally:** `.gitattributes` pins LF, or Prettier fails on every
  checkout.
- **Git Bash heredocs mangle backslashes and some quotes:** write files with an editor or
  a script file, not `cat <<EOF`, when the content has `\`.
- **The console code page is GBK:** run Python with `PYTHONUTF8=1`.
- **Git's global identity is a personal address:** this repository uses a repo-local
  `user.name`/`user.email` with the GitHub no-reply address.

## 2026-11-19, day-1 spikes (S1 to S8)

Run from the throwaway branch `spike/day-1` (kept locally, not merged) against
`npx deepspace dev start` on SDK 0.44.2, driven by a Playwright spec signed in as a test
account. S3 used the real platform file storage. The questions are in
[plan.md](plan.md#de-risking-spikes-day-1).

| #   | Result                  | Measured                                                                                                                                                                                                     | Still open                                           |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| S1  | Pass, locally           | A 1.5 MB `rows` array (47,324 rows) comes back intact: create 35 to 47 ms, get 20 to 32 ms, whole action about 100 ms                                                                                        | The 2 MB row limit: local accepts an 8 MB record     |
| S2  | Pass, locally           | 50,000 rows in a 2.3 MB all-quoted file, answer key read from a record: 53 to 67 ms per request (an empty action: 10 to 23 ms). About 35 to 46 ms of CPU in Node for body parse, key parse, CSV parse, score | The CPU limit of the deployed Worker                 |
| S3  | Decided: keep the route | Member B replaced and then deleted member A's `app`-scope file. The Worker wrote 5 MB into the host's `self` folder (1.7 to 2.0 s) and a public route streamed it back intact in 0.3 s with `Content-Length` | Nothing                                              |
| S4  | Pass                    | 5 creates in one request and 20 two-request races: exactly one create wins every time. The loser has no `code`; its `error` starts with `Duplicate: a record with`                                           | Nothing (SDK code, the same once deployed)           |
| S5  | Pass, locally           | Job: 200 writes in one run (0.9 s), 5 chunks of 40 with `ctx.continue` (1.0 s in total), 1,200 in one run (5.3 s; 1.6 s with 20 in flight). Cron task: 200 writes in 0.9 s                                   | The subrequest limit: local does not enforce one     |
| S6  | Pass, locally           | 4,999 rows arrive as one 1.95 MB WebSocket frame, ready in 82 ms; a new row appears live. With no `limit`, all 5,003 rows arrive                                                                             | The WebSocket message size limit on the deployed app |
| S7  | Pass                    | With `authorizeWrite: () => false`, `enqueueJob` from the cron task and from an action still ran the job; a signed-in member's `useJobs().enqueue` rejected with `JobRoom write access denied`               | Nothing (SDK code)                                   |
| S8  | Not run                 | Needs two owner-controlled addresses; one send costs $0.013                                                                                                                                                  | Everything                                           |

**What the spikes taught**

- **Local `workerd` does not enforce the platform's limits.** A record with 8 MB of JSON
  wrote and read back, and one job run made 1,200 record writes. A local pass says nothing
  about the 2 MB row limit, the CPU limit, the subrequest limit or the WebSocket message
  limit. Confirm those on the deployed app before relying on them.
- **`app`-scope files are writable and deletable by every signed-in member,** not only by
  the uploader. Never put anything there that another member must not replace. Datasets
  stay in the host's `self` folder behind the Worker route
  ([ADR 0011](decisions/0011-datasets-in-host-files-behind-a-route.md)). The host can
  still replace or delete a file in their own folder through `useR2Files`.
- **`appFiles` takes two kinds of key.** `upload({ key })` and `list({ prefix })` take the
  key inside the scope (`spike/train.csv`); `download` and `delete` take the stored key
  that `upload` returns (`apps/<app>/users/<id>/spike/train.csv`). The short key answers
  `Access denied: key outside scope`. Store the returned `key` on the record.
- **A `uniqueOn` refusal has no `code`.** The result is `success: false` with an `error`
  that names the fields and the collection and always begins
  `Duplicate: a record with`. Detect it with `error.startsWith('Duplicate:')`, in one helper
  ([ADR 0008](decisions/0008-daily-limit-with-uniqueon-slots.md)). An update into a taken
  key is refused the same way.
- **`tools.create` with an existing `recordId` is a merge, not a refusal.** It does not
  guard against creating twice; only `uniqueOn` does.
- **`tools.create` and `tools.update` return the whole record** as `data.record`, although
  the SDK types say `{ recordId }`. Creating the answer key sends its 1.5 MB back to the
  Worker. Never pass a raw tools result to the client; `implement()` strips it.
- **An action's `tools.query` returns every match when no `limit` is given:** 5,000 rows,
  1.97 MB, in one call (23 ms locally). The default of 50 and the 30 KB page cap noted on
  day 0 belong to the agent tools, not to action tools. `offset` works at runtime but is
  missing from the `ActionTools` type.
- **A `useQuery` subscription has no default cap, and `limit` also caps live rows.** With
  `limit: 5000` and 5,000 rows shown, three more inserts never appeared. Subscribe to a
  competition's submissions without `limit`.
- **A submission row is about 390 bytes on the wire, not 100.** The record envelope
  (`recordId`, `createdBy`, two ISO timestamps) and the JSON keys outweigh the data. 5,000
  submissions are 1.95 MB per viewer, sent as one frame
  ([ADR 0007](decisions/0007-derive-the-leaderboard-from-submissions.md)).
- **The two answer-key caps do not agree.** `[id, target, split]` rows with 7-character
  ids take 30 to 35 bytes each, so 50,000 rows are 1.58 MB (classification) or 1.73 MB
  (regression), above the 1.5 MB cap; longer ids reach the cap sooner. The byte cap is the
  one that binds. SQLite's limit counts bytes, so measure the UTF-8 length, not
  `string.length` ([ADR 0006](decisions/0006-answer-key-in-a-server-only-collection.md)).
- **`createdBy` is the caller for an action's writes and the owner for cron and job
  writes.** Do not use it to decide who owns a row; store the id in a column.
- **`authorizeRead` defaults to `authorizeWrite`.** Closing writes on the JobRoom also
  hides the queue from every client unless `authorizeRead` is set separately. A member
  who may read sees every job's payload.
- **`ctx.continue` costs little:** the next chunk started about 50 ms after the previous
  one returned.
- **`APP_OWNER_JWT` in `.dev.vars` cannot call the app's own actions.** It carries
  `scope: app:<id>` for the integrations API, and the app's `verifyJwt` refuses scoped
  tokens (401). To call an action from a script, sign in a test account with the `users`
  fixture and take the token from `getAuthToken()` in the page.
- **`deepspace test run` owns port 5173 and will not reuse a running dev server.** To
  iterate against `npx deepspace dev start`, run `npx playwright test -c <config>` with a
  config that has no `webServer`.
- **Playwright empties `test-results/` at the start of every run.** Write logs that must
  survive somewhere else.
- **Locally the clock moves during CPU work; on Cloudflare it does not.** `Date.now()`
  around pure computation reads 0 in production. Time a request from the caller, or read
  the CPU time in `npx deepspace logs`.
- **The file allocation shows as 1.0 GiB** (`npx deepspace app files list`), not the
  128 MiB the docs give for the free plan. The usage figure lagged a delete by a few
  minutes.

## 2026-11-19, day 1: domain core

- **A `\uFEFF` escape can reach the file as a real byte order mark.** It happened when an
  agent wrote `src/domain/csv.ts`: the tests still passed, because the character is the
  same, but the source then held an invisible character inside a regular expression.
  ESLint's `no-irregular-whitespace` caught the one in the regex and missed the ones
  inside strings. After writing a file that mentions a BOM or any other invisible
  character, search it for the raw bytes (`grep -c $'\xef\xbb\xbf' <file>`).
- **`noUncheckedIndexedAccess` turns every `array[i]` into a branch.** Writing
  `truth[i] ?? ''` to satisfy it adds a fallback no test can reach, and branch coverage
  drops (76% on the first draft of `metrics.ts`). Iterate with `forEach` or `for…of`, and
  where two arrays are walked together, check the lengths once and cast in one helper.
- **Property tests find floating-point edges that are not bugs.** "MAE never exceeds
  RMSE" failed for an error of 5e-324, whose square underflows to 0. Generate values the
  app can actually receive (here: six decimals) instead of loosening the assertion.
- **scikit-learn is not installed on this machine.** The fixtures were generated from a
  throwaway virtual environment: `python -m venv <dir>`, then
  `pip install --index-url https://pypi.org/simple -r scripts/fixtures/requirements.txt`.

**Pull requests and `main`**

- **`main` has been protected since 2026-11-19** (after day 1 merged): a pull request is
  required, the `quality` check must pass, conversations must be resolved, history is
  linear, and none of it can be bypassed by the owner. No approval is required, because
  a repository with one person has nobody to give it. Read the rules with
  `gh api repos/tomstao/holdout/branches/main/protection`.
- **A stacked pull request is merged when its head reaches its own base, not when its
  commits reach `main`.** Day 1 was four pull requests, each based on the one before.
  Fast-forwarding `main` to the top of the stack marked only the first as merged; the
  others needed their base branches moved forward too. With `main` protected that
  shortcut is gone, and "Rebase and merge" rewrites commit ids, so every later pull
  request of a stack has to be rebased onto `main` and force-pushed before it merges.
  Prefer pull requests that are each based on `main`.
- **Two pull requests that both append to this file, or tick neighbouring lines of
  `plan.md`, conflict.** That is why day 1 was stacked. To keep pull requests independent,
  tick the plan and add lessons in the pull request that merges last, or in a small docs
  pull request afterwards.
