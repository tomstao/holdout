# Testing

What is tested where, and the commands. The rule from DeepSpace's guide applies: green
checks are necessary, not sufficient; done means the core loop works on the deployed app
for a fresh user.

## Commands

| Command                            | Runs                                                                           | Needs                 |
| ---------------------------------- | ------------------------------------------------------------------------------ | --------------------- |
| `npm run check`                    | Prettier check, ESLint, `tsc -b`, dependency-cruiser, unit tests with coverage | Nothing               |
| `npm run validate`                 | `tsc -b` and unit tests (pre-push hook; `deepspace workspace land --validate`) | Nothing               |
| `npm run test:unit` / `test:watch` | Vitest                                                                         | Nothing               |
| `npm run design:gate`              | DeepSpace product-polish and anti-AI checks; part of `npm run check`           | Nothing               |
| `npx deepspace test run`           | Playwright smoke and API specs against a local dev server                      | Login, registered app |
| `npx deepspace test run all`       | Every Playwright spec                                                          | Login, test accounts  |
| `npm run build`                    | Production build                                                               | Registered app        |

Before the app is registered, Vitest runs only its `pure` project and says it skipped
`app`; `npm run build` refuses. Both are expected ([lessons](lessons.md)).

## Unit and property tests (Vitest, `pure` project)

Next to the code, `*.test.ts`. Coverage thresholds (lines, functions and statements 90%,
branches 85%) apply to `src/domain`, `src/contracts` and `src/actions/implement.ts`.

| Area                                 | What is asserted                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain/csv`                         | Quoting, embedded newlines, BOM, CRLF, empty trailing line; limits; round trip (fast-check)                                                                                                                                                                                                                                                                                                                                          |
| `domain/metrics`                     | Values equal scikit-learn's on committed fixtures; direction; single-class and empty inputs                                                                                                                                                                                                                                                                                                                                          |
| `domain/split`                       | Partition, stability for a seed, stratification (fast-check); `Usage` parsing                                                                                                                                                                                                                                                                                                                                                        |
| `domain/dataset`, `predictions`      | Each validation rule produces an issue with file, row and column; at most 20 issues per file; numbers too large to score refused; a header of two million columns quoted as twelve                                                                                                                                                                                                                                                   |
| `domain/ranking`                     | Best score per participant, tie to the earlier submission, two auto-picked finals, shake-up                                                                                                                                                                                                                                                                                                                                          |
| `domain/close-email`, `server/close` | The close-out email: one message to the host with the top three and the link, no address in the text, no field that could add a recipient; none for a host whose address mail cannot reach; a title cannot add a line. In the job: sent only after the write that closes, never by a second run, never before the deadline; no participant row is read; a refused send still leaves the competition closed; no address in the result |
| `domain/listing`                     | Each competition in one section; order by urgency; stable for any input order (fast-check)                                                                                                                                                                                                                                                                                                                                           |
| `domain/time`                        | UTC day boundaries, reset time, deadline comparison, a deadline that only moves later                                                                                                                                                                                                                                                                                                                                                |
| `contracts`                          | Result envelope, action client error handling, wire round trip with `implement`, schema drift                                                                                                                                                                                                                                                                                                                                        |
| `actions`                            | Each handler with fake `tools`: authorisation, refusals, the slot retry, output stripped; the cheap checks before the answer key is read; a submission removed again after any failure, thrown or returned; a score that is not a number stores nothing; `withRetry`                                                                                                                                                                 |
| `scripts/theme-contrast`             | The Holdout theme reaches WCAG AA for every token pair the app uses, read from `themes.css`                                                                                                                                                                                                                                                                                                                                          |
| `scripts/demo`                       | The demo files pass the app's dataset rules, keep each species' share, hide the source order                                                                                                                                                                                                                                                                                                                                         |
| `server/surface`, `room-guard`       | The real route registrations: only this app's record room; no integration; no upload; frames for the built-in collection refused                                                                                                                                                                                                                                                                                                     |

Metric fixtures come from `scripts/fixtures/metrics.py` (scikit-learn 1.6 or later; the
committed file was made with 1.9.1). It is run by hand, is seeded, and rewrites
`src/domain/metrics.fixtures.json`: 11 classification and 10 regression cases with
scikit-learn's values, which the test asserts to 1e-12. The JSON is in `.prettierignore`,
so regenerating it needs nothing but Python.

## Playwright specs (`tests/`, `npx deepspace test run`)

| Spec                  | Asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`       | The landing: one title, description and canonical; no auth call or socket; the real headline of 3 to 8 words, under 150 words of copy, the code-built leaderboard and no `<img>`; its first button's label agrees with its target (the list here, the demo competition against the live site); the board animates and stops under reduced motion. `/home`: the real H1, no placeholder copy, its own `<title>`, the Holdout theme and fonts, the navigation links; the visitor's sign-in prompt opens the overlay. 404  |
| `api.spec.ts`         | `createCompetition`: 401 without a token, `invalid_input` and `invalid_file` with their issues, then a real competition a visitor can read and whose three files the route serves; unknown file kinds and competitions answer 404                                                                                                                                                                                                                                                                                       |
| `rbac.spec.ts`        | Asked of the record room directly over its WebSocket: a visitor and a member are refused a create in each of the five collections and are sent no `answer_keys` or `private_scores` rows. From PR 6: the same reads once a competition exists, and no action response contains a private score                                                                                                                                                                                                                          |
| `submit.spec.ts`      | `submitPredictions` against the real room: 401 without a token; a perfect file scores 1 and the answer carries no private score; nobody, the submitter included, is sent a `private_scores` row; `not_found`, the host refused, a bad file refused with its row and column and no slot used; with a limit of 1, two submissions sent at once give one score and one `limit_reached`                                                                                                                                     |
| `competition.spec.ts` | `/c/:id` for three people: a visitor sees the empty board, the rules, the data with a five-row preview, and a sign-in prompt on Submit; a participant's bad file is caught before sending, two good ones are scored, "Best" is marked and their leaderboard row says "(you)"; the visitor's open page shows the row without a reload; the host has no Submit tab                                                                                                                                                        |
| `home.spec.ts`        | `/home` for a host, a participant, a bystander and a visitor: the same competition under Hosting, Open, then Entered after a submission; participants and top score change without a reload; the title leads to the competition; the visitor has no Hosting section and gets the sign-in prompt; the account menu opens and leads to Settings                                                                                                                                                                           |
| `demo.spec.ts`        | The demo files from `scripts/demo` go through the real create action: three labels, 136 test rows, about 30% public; the sample submission the app wrote scores as a baseline; the answers score 1.0000                                                                                                                                                                                                                                                                                                                 |
| `surface.spec.ts`     | Against the running Worker: every `/ws` path but the app's room is 404; a visitor's and a member's write to the built-in collection is refused; a member gets 404 from an integration and from the agent tool route, and 405 from an upload                                                                                                                                                                                                                                                                             |
| `create.spec.ts`      | `/host/new` end to end: a visitor is asked to sign in; problems appear under the file with row and column and Create stays disabled; the corrected file clears them; field messages appear and go; the new competition opens on `/c/:id` and its sample file downloads; an unknown competition says so                                                                                                                                                                                                                  |
| `collab.spec.ts`      | A host and two participants: each participant's page shows the other's new row without a reload, flashing; rows reorder by best score and a tie goes to the earlier best; after the daily limit the page says when the count resets, Submit is disabled and the server refuses with `limit_reached`. Also the scaffold's two-account and API-status checks; the viewer's rank is in a polite live region; on a window too short to show second place, its owner still sees their row and the other participant does not |
| `close.spec.ts`       | A competition due in 45 seconds closes on its own (about 70 s): the open page goes from Open to Closing to Closed without a reload; a late submission is refused; the final standings, the viewer's rank, the public board as it stood and the private scores of the chosen submissions appear; `private_scores` stays closed                                                                                                                                                                                           |
| `edit.spec.ts`        | The host's Edit tab: a short title refused under its field; new text saved and shown on a participant's open page without a reload; moving the deadline asks first, names the new time, and the participant's countdown follows. A participant has no Edit tab. Through the API: no token, a participant, an earlier deadline and an unknown competition are each refused, and the record is unchanged                                                                                                                  |

`tests/helpers/room.ts` opens the room's socket as any caller, so a spec can read or write a
collection without a page that mounts the hooks.

Accounts: `npx deepspace test accounts create` (at most 10 per machine); the multi-user
fixture signs them in. The full suite needs three: `collab.spec.ts` uses a host and two
participants, and skips itself with fewer ([DeepSpace testing guide](https://docs.deep.space/guides/testing.md)).
No action deletes a competition, so a spec's competitions (titled `__test-<time>__ …`) stay
in the local room; delete `.wrangler/state` to start clean. Their files go to the real
platform storage and are removed in `finally`.

**Paid calls in tests:** none. The close job has a sender for the close-out email only
when `ALLOW_DEBUG_ROUTES` is not `"true"` (the flag `deepspace dev` and `deepspace test`
set). Without one it builds the message, logs that it was not sent, and sends nothing.
The test accounts' addresses end in `.test`, which mail cannot reach, so a competition
they host sends nothing on the live site either (`email: "none"` in the job's result).

**What is different locally:** with that flag set, `createCompetition` accepts a deadline
15 seconds ahead instead of an hour, so `close.spec.ts` can watch a competition close.

## On the deployed app

The spec's acceptance criteria are walked by `tests/live/acceptance.live.ts`, with its own
config and three test accounts (a host and two participants). It is not part of
`npx deepspace test run`. **Run it only when the owner asks:** each run of "walk" leaves
one competition on the live site for good, titled `[TEST] Acceptance walk-through
<time>`, listed for everyone, and gives the three accounts a `users` row there.

```sh
npx playwright test -c tests/live/playwright.live.config.ts -g "walk"    # about 30 s
npx playwright test -c tests/live/playwright.live.config.ts -g "close:"  # waits for the deadline
```

| Test    | Asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "walk"  | Criteria 1 to 4. The form names the file, row and column of three bad files and the server refuses one sent past it; a competition is created through the form; a visitor sees it open with its downloads; a bad predictions file is refused and uses no slot; a valid one is scored and appears on two other screens without a reload; the file after the daily limit is refused with the reset time; the host may not submit; a visitor, both participants and the host are sent no row of `answer_keys` or `private_scores` while the same socket delivers the public rows; the agent tools answer 404 |
| "close" | Criterion 5, without the email. On a page opened before the deadline the status goes to Closed with no reload; a late submission is refused; the final standings show the public leader last, with "Up 1 place" and "Down 1 place"; a visitor, the other participant and the host get the same standings; the public board as it stood is one click away; the closed collections stay closed                                                                                                                                                                                                              |

A deployed app wants a deadline at least an hour ahead, so "walk" sets 63 minutes and
writes the competition's id and deadline to a file (`HOLDOUT_LIVE_STATE`, by default in
the temp folder) that "close" reads. "close" can be run again after the fact; only its
watching of the deadline is lost. The write probes of `rbac.spec.ts` are not repeated
there: a probe that succeeded would leave a row on the live site.

To rehearse "walk", point `HOLDOUT_LIVE_URL` at a local server that is already running.

After a deploy that touches the core loop, also check `npx deepspace logs` for errors and
`npx deepspace app usage` for spend.
