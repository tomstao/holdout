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

Run from the throwaway branch `spike/day-1` (kept locally, not merged) on SDK 0.44.2,
driven by a Playwright spec signed in as a test account: first against
`npx deepspace dev start`, then against the deployed app (the owner deployed the spike
branch once, as release #2, to be rolled back afterwards). S3 used the real platform file
storage both times. The questions are in [plan.md](plan.md#de-risking-spikes-day-1).

| #   | Result                  | Locally                                                                                                                                                            | On the deployed app                                                                                                                                                                                                   |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Pass                    | A 1.5 MB `rows` array (47,324 rows) comes back intact: create 35 to 47 ms, get 20 to 32 ms, whole action about 100 ms                                              | Intact: create 110 to 147 ms, get 41 to 65 ms, whole action about 370 ms. An 8 MB record was also stored and read back, so the 2 MB row limit did not show up                                                         |
| S2  | Pass                    | 50,000 rows in a 2.3 MB all-quoted file, answer key read from a record: 53 to 67 ms per request. About 35 to 46 ms of CPU in Node                                  | 24 of 24 requests scored, 270 to 550 ms each including the upload of 1 to 2.6 MB (an empty action: 82 ms). Every outcome `ok`, no `exceededCpu`                                                                       |
| S3  | Decided: keep the route | Member B replaced and then deleted member A's `app`-scope file. The Worker wrote 5 MB into the host's `self` folder and a public route streamed it back intact     | The same, with the route streaming 5 MB in 0.27 s with `Content-Length`                                                                                                                                               |
| S4  | Pass                    | 5 creates in one request and 20 two-request races: exactly one create wins every time. The loser has no `code`; its `error` starts with `Duplicate: a record with` | The same: one winner in 20 of 20 races                                                                                                                                                                                |
| S5  | Pass                    | Job: 200 writes in one run (0.9 s), 5 chunks of 40 with `ctx.continue` (1.0 s), 1,200 in one run. Cron task: 200 writes in 0.9 s                                   | Job: 200 writes in one run (5.7 s), 5 chunks of 40 (5.7 s), 1,200 in one run (32.9 s; 3.0 s with 20 in flight). Cron task: 200 writes in 5.4 s (0.45 s with 20 in flight), 1,100 in one run. An action stops at 1,000 |
| S6  | Pass                    | 4,999 rows arrive as one 1.95 MB WebSocket frame, ready in 82 ms; a new row appears live. With no `limit`, all 5,003 rows arrive                                   | The same frame, ready in 560 ms; a new row appears live                                                                                                                                                               |
| S7  | Pass                    | With `authorizeWrite: () => false`, `enqueueJob` from the cron task and from an action still ran the job; a member's `useJobs().enqueue` was refused               | The same                                                                                                                                                                                                              |
| S8  | Not run                 | Moved to day 4 with the close-out email (the owner's choice); needs two owner-controlled addresses and costs $0.013                                                | Not run                                                                                                                                                                                                               |

After the deployed run the four spike collections were empty and the file storage showed
0 B. The two test accounts now have `users` rows in the production room.

**What the spikes taught**

- **Local `workerd` does not enforce the platform's limits, and it is about six times
  faster.** Locally a record with 8 MB of JSON wrote and read back and one action made
  1,100 record writes in 1.4 s. A local pass says nothing about a limit or a duration.
  Measure both on the deployed app.
- **A Worker request may make 1,000 record writes.** The next one throws
  `Too many API requests by single Worker invocation`. Every `tools.*` call is one. An
  action that loops over rows must stay far below that or hand the work to a job. The
  jobs and the cron task, which run in a Durable Object alarm, went past it: 1,200 and
  1,100 writes in one run.
- **A record write takes about 28 ms on the deployed app** (4 ms locally). One at a
  time, 200 writes are 5.6 s; with 20 in flight they are 0.45 s. Write rows in parallel
  batches (`Promise.all` over 20), in the close job above all.
- **The 2 MB Durable Object row limit did not show up.** Records of 2.2, 3 and 8 MB were
  stored and read back on the deployed app. The 1.5 MB cap on the answer key stays:
  nothing documents a higher limit, and every submission reads the whole key (8 MB took
  0.33 s to read and 0.63 s to write).
- **`npx deepspace logs` shows a request's outcome, not its CPU time.** A request event
  has `outcome` (`ok`, `canceled`, `exceededCpu`), method, path and status. So a CPU
  limit can be seen being hit, but the margin below it cannot be read. A page that closes
  shows as `canceled` WebSocket requests; those are not errors.
- **The Playwright `users` fixture works against the deployed app.** Point the config's
  `baseURL` at `https://holdout.app.space` and leave out `webServer`. A test account that
  signs in there gets a `users` row in the production room.
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
  around pure computation read 0 on the deployed app, as expected. Time a request from
  the caller.
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

## 2026-11-19, day 2: data model

- **The record room stores `null` as "no value" and leaves the key out on read.**
  (`rowToData` in the SDK skips `null` columns.) A contract field written as
  `.nullable()` would never read back as `null`. Model a value that may be missing as
  `.optional()` and leave it out when writing.
- **Never mark a column `immutable` in a closed collection: it leaks the stored value.**
  On an update the room compares each immutable field with what is stored before it
  checks permission. A member who sends the right value is told `UPDATE DENIED`; one who
  sends a wrong value is told `Cannot modify immutable field '…'`. With `privateScore`
  immutable, a participant could have read a private accuracy by trying each of the
  `privateRows + 1` possible values. `answer_keys` and `private_scores` declare no
  immutable column, a unit test keeps it that way, and `rbac.spec.ts` sends right and
  wrong guesses and expects the same answer. Found by the seeded RBAC spec, confirmed in
  the SDK source (`putRecord` in `deepspace/dist/worker.js`, 0.44.2).
- **The room replays its answer to a request id.** A second `core.put` with the same
  `requestId` gets the first one's answer whatever it contains. A probe that reuses an id
  sees one answer repeated and misses the difference above; `tests/helpers/room.ts`
  generates a new id per write.
- **The room checks a write's shape before its permission.** A member's `core.put` of an
  incomplete record answers `Required field 'summary' is missing`; only a complete one
  answers `CREATE DENIED: role=member, collection=…`. A test of a refusal has to send a
  valid record, or it passes for the wrong reason.
- **A subscription to a closed collection, an empty one and one that does not exist all
  answer the same: no records.** "The participant receives nothing" proves nothing until
  rows exist. Seed through an action, then read as another user.
- **The room can be driven without a page.** Open `/ws/app:<id>?token=<jwt>` and send
  `{ type: 'core.subscribe', payload: { subscriptionId, query: { collection } } }` or
  `core.put`; the first frame back is `user.info` with the caller's role
  (`tests/helpers/room.ts`). The token is `POST /api/auth/token` with the session cookie.
- **`deepspace rollback` needs `--yes` when it is not at a terminal,** and says so only
  after preparing. A rollback is recorded as a new release (release #3 re-deployed #1).
- **A heredoc that contains an apostrophe fails in this Git Bash even when its
  delimiter is quoted.** Write generated files with an editor or a script file.
- **commitlint refuses a commit body line over 100 characters.** A long sentence passed
  with `git commit -m` is one line. Write the message to a file with wrapped lines and
  use `git commit -F`.
- **A spec that creates a competition leaves it behind.** There is no delete action, and
  no client may delete a record. The record stays in the local room (titled
  `__test-<time>__`); only its files, which are on the real platform storage, can be
  removed, by the host through `DELETE /api/files/<stored key>?scope=self`.
- **`appFiles` cannot be imported in a Vitest unit test's subject without loading the
  Worker SDK.** `create-competition.ts` takes its file store, clock, seed and id source as
  dependencies; `host-files.ts` holds the real ones and is the only file that imports
  `deepspace/worker` at runtime.

## 2026-11-19, day 2: the create form

- **Zod's own messages are not for people.** "Too small: expected string to have >=3
  characters" under a field is noise. The contract gives each field a person fills in a
  message that can be shown as it is, and the form shows `issue.message` unchanged.
- **A full-page screenshot captures only the viewport.** The app shell is `h-screen` and
  scrolls inside `<main>`, so the page never grows. Give the page a tall viewport
  (`page.setViewportSize`) before `page.screenshot`.
- **A colour that just changed is still in transition.** A drop zone measured red 50 ms
  after its problems were fixed (`transition-colors`). Assert the class or the
  `data-state`, not the computed colour, and do not judge it from a screenshot taken at
  once.
- **React 19's types deprecate `FormEvent`.** Use `SyntheticEvent` for a submit handler.
- **The scaffold's lint exemption covered every page under `(protected)/`.** It was a
  glob. It now names the three scaffold files, so our own protected pages get the strict
  rules.
- **`node` cannot run a contract file directly.** Imports without an extension resolve in
  Vite and Vitest only. To look at what a schema answers, write a unit test.

## 2026-11-19, day 3: submitting

- **Domain code cannot use `Date`, so the UTC day is computed by hand.** `utcDay` in
  `src/domain/time.ts` uses Hinnant's civil-from-days algorithm; a property test compares
  it with `Date.prototype.toISOString` over 1970 to 2200. That test is the one place in
  `src/domain` with an `eslint-disable` for `Date`.
- **The fake record store imitates `uniqueOn` and concurrent writes.** `fakeRoom(seed,
{ uniqueOn })` refuses a duplicate with the room's own text, and `before(call, effect)`
  runs a write just before the handler's next call, which is how a unit test plays the
  race of two submissions.
- **A submission's answer must not carry the private score, and `implement()` makes sure
  of it:** the output contract has no such field. The spec still asserts the answer's
  exact keys, so a contract change that added one would fail a test.
- **The kit's `EmptyState` takes an action as `{ label, onClick }`,** not an element. A link
  there means a click handler that navigates.
- **A tab panel is not mounted until its tab is chosen.** A spec that needs an element of
  the Data tab clicks the tab first; the tab is in the URL (`?tab=data`), so a test can
  also open it directly.
- **A highlight for new rows needs no state.** The leaderboard keys each row by the
  participant and their latest submission, so a new submission remounts that row and a
  CSS animation plays once. Rows older than the page itself do not get the class. No
  effect, no timer, nothing for the React hooks rules to object to.
- **`tests/` has no DOM types** (`tsconfig.node.json` has no `DOM` lib), so
  `locator.evaluateAll((rows) => rows.map((row) => row.getAttribute(…)))` does not type
  check. Read attributes through locators (`rows.nth(i).getAttribute(…)`) instead.
- **The live spec needs three test accounts** (a host and two participants); the pool on
  this machine is Alice, Bob and Carol. A spec that needs more accounts than exist skips
  itself and says how to create one.

## 2026-11-19, day 4: the close

- **The cron task ticks in the local app.** `deepspace dev` and `deepspace test` run the
  CronRoom's alarm, so a spec can wait for a real close; it logs `[close] enqueued …` and
  the job's result in the server output.
- **A rule relaxed for tests changes what an API test can assert.** With
  `ALLOW_DEBUG_ROUTES` set, `createCompetition` accepts a deadline 15 seconds ahead. The
  API test of "less than an hour" then created a real competition and failed. The hour
  is now asserted in the action's unit test and the API test asserts the local rule.
- **A test that fails after creating a competition leaves its files in storage.** They
  are in the test account's private folder on the real platform. List them as that
  account (`GET /api/files?scope=self&prefix=competitions/`) and delete each one.
- **The scaffold's lint exemption covered all of `src/server/`.** It now names the three
  scaffold files; `files-routes.ts`, `room-tools.ts` and `close.ts` get the strict rules.
- **Worker code that is not an action needs its own record tools.** The scaffold builds
  them inside its action route. `src/server/room-tools.ts` makes the same call for the
  cron task, the job and the files route, so they can use `typedRecords`.

## 2026-11-19, day 4: the theme

- **The scaffold's status colours fail AA on a light theme.** Its success green is about
  2.5:1 as text on paper. The scaffold says they are not themed; a light theme has to
  set them anyway ([ADR 0015](decisions/0015-theme-status-colours-and-self-hosted-fonts.md)).
- **Compute contrast before looking at a screen.** A test that reads the theme block and
  checks each pair found one failure in the first palette (orange text on the darkest
  neutral) before anything was rendered, and keeps finding them when a value changes.
- **`@fontsource/<family>/<weight>.css` is the file to import**, not the
  `latin-<weight>.css` ones. Only the first carries `unicode-range`, which lets a
  browser skip the scripts a page does not use.
- **Node will not run a `.ts` file under `node_modules/`**
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so a throwaway TypeScript script
  cannot live in `node_modules/.tmp/`. Python edit scripts there are fine.
- **A Git Bash heredoc halves the backslashes in a regular expression too.** The same
  rule as before: write files that contain backslashes with the editor tools.
- **`deepspace test screenshot` needs a server that is already running.** For signed-in
  screens with data, a temporary Playwright spec that calls `page.screenshot()` is
  simpler: `deepspace test run` starts the server and signs the accounts in.

## 2026-11-19, day 4: the competition list

- **A list can read each row's numbers with the row's own subscription.** A row
  component calls the same hook the competition page uses, so the participant count and
  the top score are exact and live with no server change. The cost is one subscription
  per visible row, so a section shows eight rows until asked for more.
- **The local room keeps every competition the specs ever created** (clients cannot
  delete, and there is no delete action). After a day of test runs `/home` listed about 100. A spec that looks for its own row has to open "Show all" first, and should find
  the row by its id, never by position.
- **Competitions come due while the local server is off.** The cron task closes them the
  next time `deepspace dev` or `deepspace test` runs, one job at a time.
- **`deepspace test run a.spec.ts b.spec.ts` runs only the first file.** Run them one
  after the other, or use a suite name such as `all`.
- **The design gate looked for `[data-theme="x"]` with double quotes.** Prettier writes
  the selector with single quotes, so the gate missed the theme block. It accepts both
  now. A check that greps a formatted file should not depend on the quote style.

## 2026-11-19, day 4: file storage under concurrent uploads

- **The file storage refuses uploads that race for one account's usage counter.** The
  SDK keeps a usage summary per account and updates it by compare-and-swap, eight
  attempts with no wait between them (`deepspace/dist/worker.js`, the quota admission).
  The losers get `AppFileError` with status 503: "Storage is busy with other uploads.
  Retry shortly." Eight competitions created at once by one account lost two of eight.
- **So a file write retries on 503.** `src/actions/retry.ts` wraps the host's uploads and
  deletes: up to four attempts, waits of about 150, 400 and 900 ms spread at random. The
  key is fixed, so a repeated upload writes the same object. The same eight at once now
  all succeed, with three retries logged, in two runs out of two.
- **It showed up as a flaky spec first.** Playwright runs the specs in parallel and every
  host in them is the same test account, so adding one more spec that creates a
  competition was enough. A second platform answer seen once the same day, not
  reproduced: `put: Please look at https://www.cloudflarestatus.com … (10043)`. It is not
  a 503 from the files API as far as the log shows, and is not retried.
- **To reproduce a concurrency fault, write the stress case first.** A temporary spec
  that fires eight `createCompetition` calls with `Promise.all` failed before the fix and
  passed after it, which a rerun of the flaky suite could not show.

## 2026-11-19, day 4: the landing page

- **A prerendered page can animate with no script.** The hero's leaderboard is markup
  plus CSS keyframes, with each row's travel in an inline custom property
  (`style="--shift:4"`). It moves in the static HTML, needs no `window`, and
  `prefers-reduced-motion` turns it off in one media query.
- **Keep the keyframes in the global stylesheet.** A route's own CSS file loads with the
  route's script; the prerendered HTML links only the entry stylesheet, so the board
  would have painted unstyled first.
- **Animate what moves, not what labels it.** The rank numbers are a separate column.
  Rows slide past them, so no number has to change mid-flight.
- **Look at a frame from the middle of an animation.** A screenshot during the slide
  showed the status label blank for a second and a doubled rule under the last row.
  Neither was visible in the start and end frames.
- **Import one kit file, not the kit's index, into the static page**
  (`components/ui/Button`), and nothing from `deepspace`: the landing should not pull
  the auth client into its bundle (the scaffold's `Seo.tsx` says the same).
- **The design rules a linter cannot check fit in a smoke test.** Headline length, the
  word budget and "no `<img>`" are three assertions on the rendered page.
- **`grep -P` needs a UTF-8 locale in Git Bash** (`LC_ALL=C.UTF-8`) for the official
  emoji check; without it the command fails instead of finding nothing.
- **A port can stay busy for a few seconds after `deepspace test run` returns.** Starting
  another run at once fails with `port_in_use`; it is free a moment later.

## 2026-11-19, day 4: the demo competition's files

- **The seed of a public data set's shuffle is an answer key.** The demo's labels are
  public, and the generator and its source file are in a public repository. So the seed
  is drawn when the owner runs the script and is never committed, and the output folder
  is git-ignored. It stops the easy path only: rows can still be matched on their
  measurements, which is why the competition is labelled practice.
- **Node runs a `.ts` script only if every import has its extension.** The app's modules
  import each other without one, so a script that Node runs directly cannot import them.
  The generator is self-contained; its Vitest test, which resolves imports the app's
  way, checks the output against the app's own `validateDataset`.
- **A composite TypeScript project may import only files it lists** (TS6307). The scripts
  project gained `src/domain` in its `include` for that test
  ([ADR 0002](decisions/0002-split-typescript-projects.md), addendum).
- **Guessed expected values are a useful first test run.** The first run showed 206 and
  136 rows where 205 and 137 were expected: each species is rounded on its own. The
  numbers in the test are the ones the split gives, checked by hand (60 + 27 + 49).
- **`deepspace test run` will not share a port with `deepspace dev`.** When the owner
  has the dev server open on 5173, run the specs beside it with `--port 5183`; do not
  stop a server someone else started. The runner's config says the same: one port per
  run.
- **Treat a downloaded file as data before it is code's input:** fetched into an empty
  folder and checked for size, header, row and class counts, quotes and formula-like
  cells before it was copied into the repository.

## 2026-11-19, day 4: editing a competition

- **A `datetime-local` input holds minutes; a stored time may hold seconds.** Read back
  from the input, an untouched deadline was up to a minute earlier than the stored one,
  and "a deadline only moves later" refused every save. The form sends the stored value
  unless the input's text changed.
- **Two writers of one record need the later one to repair, not the earlier one to
  lock.** The host's edit and the cron task can both act on a competition in the same
  instant. Neither can hold a lock, so the close job checks what it finds and undoes a
  mark that no longer holds
  ([ADR 0009](decisions/0009-close-with-cron-and-a-job.md), addendum).
- **The kit's dialog cuts a long title short.** "Move the deadline to Nov 21, 2026,
  6:37 PM?" lost its time, the one thing the dialog must show. Titles stay short; the
  detail goes in the description. Found in a screenshot, not by a test: the text was in
  the DOM.
- **A shared form part belongs in `src/components/`.** `Field` (label, hint or error)
  moved out of the create form when the edit form needed it.

## 2026-11-19, day 4: the viewer's own row

- **`position: sticky` on a table row belongs on its cells**, and it sticks to the
  nearest ancestor that scrolls. The tables sat in an `overflow-x-auto` wrapper, which
  scrolls in both directions as far as CSS is concerned; the row stuck to that and went
  nowhere. The wrapper is gone and long names wrap instead.
- **A collapsed table's borders do not travel with a stuck cell.** The pinned row draws
  its rules as inset shadows.
- **To test a pinned row, measure a cell.** `toBeInViewport()` on the `<tr>` reported
  1%: the row's own box stays where the table put it while its cells stick.
- **A live region that should speak one thing must contain only that thing.** "Your rank
  is 3." changes when the rank does. "You are 3 of 12." would also be spoken every time
  someone new joined.

## 2026-11-19: the first deploy with features (release #4)

- **A deploy ships the folder as it is, not `main`.** The owner deployed while the agent
  had the folder on a docs branch with two uncommitted files. The deploy said so
  ("shipping the working tree of docs/readme WITH uncommitted changes") and recorded no
  commit. The two files were `README.md` and a doc, so the live code equals `main`, but
  nothing proves it afterwards. Before handing a deploy to the owner: the folder on
  `main`, `git status` clean, and say so. `npx deepspace releases` shows a release made
  otherwise as "dirty worktree".
- **What can be checked on the live site without writing to it:** the landing's HTML
  with `curl` (title, headline, canonical, theme); a signed-out browser visit through
  Playwright pointed at the live URL (the landing animates, its button reaches `/home`,
  the empty list, a competition that does not exist, the sign-in gate; no console
  errors, no failed responses); `npx deepspace logs` (the close task runs every minute
  and reports ok). The room was empty, which is the one state the local room could not
  show.
- **Test competitions on the live site would stay there.** There is no delete, and they
  are listed for everyone. The acceptance walk-through on production is the owner's
  call, not something to run unasked.

## 2026-11-19: what the independent review found in the scaffold

- **The scaffold's unused routes are part of the app.** Every test here was about the
  code that was written. The holes were in code that was not: a cron socket where a
  member may pause a task, tool routes for an assistant the app does not have, an
  integrations proxy that bills the owner for any name, a file proxy that takes uploads,
  and a built-in collection open to signed-out sockets. All were live for a few hours.
  Read every route the scaffold registers before the first deploy, and remove what the
  app does not use ([ADR 0016](decisions/0016-serve-only-what-the-app-uses.md)).
- **"RBAC is the boundary" is true only where every path applies it the same way.** The
  record room's socket gives nothing away about a closed collection. The tools API, built
  on the same room, applies a filter before the permission check and reports a different
  error when it runs out of rows to scan, which is a count.
- **A room name in a URL creates the room.** A Durable Object exists once something
  fetches it, and a cron room schedules its tasks on that first fetch. A route must
  accept only the names the app means.
- **A reviewer with no context finds a different class of fault.** The build's own
  review looked at the actions and the schemas. A reader given only the guarantees went
  straight to what else the Worker serves.
- **Write the probe so it is harmless if the fix regresses:** a GET where the real call
  is a POST, an integration name that does not exist, a file of two bytes. A test of a
  spending hole must not spend when it fails.
- **A guard that parses untrusted frames needs its own tests for nonsense.** The first
  version threw on `"payload": null`; in the Worker that would have been an exception on
  every such frame.

## 2026-11-19: the submit action, after the review

- **"Finite" at parse is not "finite" after arithmetic.** Every prediction was checked
  to be a finite number, and `1e200` is one. Squared, it is not. Bound the inputs so
  the arithmetic cannot overflow (`MAX_MAGNITUDE` in `src/domain/text.ts`), and check
  the result as well.
- **A typed write can throw where a room would refuse.** `typedRecords.create` parses
  the row with its contract first, and a contract's `z.number()` rejects NaN by
  throwing. The clean-up after a failed second write only ran for a returned failure.
  Clean up in the `catch`, from a variable set by the first write.
- **When two outcomes must look the same, test that they do.** A huge prediction on a
  public row and on a private one have to get the same answer, the same number of room
  calls and no stored row, or the difference says which rows are public.
- **Order the refusals by cost.** The limit check is one small query; the answer key is
  1.5 MB. A caller who cannot submit should not make the room read the key.
- **Quote a little of an untrusted file, never all of it.** The dataset check listed
  twelve column names; the predictions check listed every one, which turned a 2 MB
  request into a 24 MB answer. The helper is shared now.
- **A test double has to be able to fail the call under test.** The fake room could not
  fail a `remove`, so "the clean-up fails too" could not be written until it could.
