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
| `npm run design:gate`              | DeepSpace product-polish and anti-AI checks                                    | Nothing               |
| `npx deepspace test run`           | Playwright smoke and API specs against a local dev server                      | Login, registered app |
| `npx deepspace test run all`       | Every Playwright spec                                                          | Login, test accounts  |
| `npm run build`                    | Production build                                                               | Registered app        |

Before the app is registered, Vitest runs only its `pure` project and says it skipped
`app`; `npm run build` refuses. Both are expected ([lessons](lessons.md)).

## Unit and property tests (Vitest, `pure` project)

Next to the code, `*.test.ts`. Coverage thresholds (lines, functions and statements 90%,
branches 85%) apply to `src/domain`, `src/contracts` and `src/actions/implement.ts`.

| Area                            | What is asserted                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `domain/csv`                    | Quoting, embedded newlines, BOM, CRLF, empty trailing line; limits; round trip (fast-check)   |
| `domain/metrics`                | Values equal scikit-learn's on committed fixtures; direction; single-class and empty inputs   |
| `domain/split`                  | Partition, stability for a seed, stratification (fast-check); `Usage` parsing                 |
| `domain/dataset`, `predictions` | Each validation rule produces an issue with file, row and column; at most 20 issues per file  |
| `domain/ranking`                | Best score per participant, tie to the earlier submission, two auto-picked finals, shake-up   |
| `domain/time`                   | UTC day boundaries, reset time, deadline comparison                                           |
| `contracts`                     | Result envelope, action client error handling, wire round trip with `implement`, schema drift |
| `actions`                       | Each handler with fake `tools`: authorisation, refusals, the slot retry, output stripped      |
| `scripts/theme-contrast`        | The Holdout theme reaches WCAG AA for every token pair the app uses, read from `themes.css`   |

Metric fixtures come from `scripts/fixtures/metrics.py` (scikit-learn 1.6 or later; the
committed file was made with 1.9.1). It is run by hand, is seeded, and rewrites
`src/domain/metrics.fixtures.json`: 11 classification and 10 regression cases with
scikit-learn's values, which the test asserts to 1e-12. The JSON is in `.prettierignore`,
so regenerating it needs nothing but Python.

## Playwright specs (`tests/`, `npx deepspace test run`)

| Spec                  | Asserts                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`       | Real H1, no placeholder copy, app-specific `<title>`, a primitive opens, navigation test ids intact                                                                                                                                                                                                                                                                                 |
| `api.spec.ts`         | `createCompetition`: 401 without a token, `invalid_input` and `invalid_file` with their issues, then a real competition a visitor can read and whose three files the route serves; unknown file kinds and competitions answer 404                                                                                                                                                   |
| `rbac.spec.ts`        | Asked of the record room directly over its WebSocket: a visitor and a member are refused a create in each of the five collections and are sent no `answer_keys` or `private_scores` rows. From PR 6: the same reads once a competition exists, and no action response contains a private score                                                                                      |
| `submit.spec.ts`      | `submitPredictions` against the real room: 401 without a token; a perfect file scores 1 and the answer carries no private score; nobody, the submitter included, is sent a `private_scores` row; `not_found`, the host refused, a bad file refused with its row and column and no slot used; with a limit of 1, two submissions sent at once give one score and one `limit_reached` |
| `competition.spec.ts` | `/c/:id` for three people: a visitor sees the empty board, the rules, the data with a five-row preview, and a sign-in prompt on Submit; a participant's bad file is caught before sending, two good ones are scored, "Best" is marked and their leaderboard row says "(you)"; the visitor's open page shows the row without a reload; the host has no Submit tab                    |
| `create.spec.ts`      | `/host/new` end to end: a visitor is asked to sign in; problems appear under the file with row and column and Create stays disabled; the corrected file clears them; field messages appear and go; the new competition opens on `/c/:id` and its sample file downloads; an unknown competition says so                                                                              |
| `collab.spec.ts`      | A host and two participants: each participant's page shows the other's new row without a reload, flashing; rows reorder by best score and a tie goes to the earlier best; after the daily limit the page says when the count resets, Submit is disabled and the server refuses with `limit_reached`. Also the scaffold's two-account and API-status checks                          |
| `limits.spec.ts`      | Invalid file does not use a slot; the slot after the limit is refused with the reset time; a closed competition refuses                                                                                                                                                                                                                                                             |
| `close.spec.ts`       | A competition due in 45 seconds closes on its own (about 70 s): the open page goes from Open to Closing to Closed without a reload; a late submission is refused; the final standings, the viewer's rank, the public board as it stood and the private scores of the chosen submissions appear; `private_scores` stays closed                                                       |

`tests/helpers/room.ts` opens the room's socket as any caller, so a spec can read or write a
collection without a page that mounts the hooks.

Accounts: `npx deepspace test accounts create` (at most 10 per machine); the multi-user
fixture signs them in. The full suite needs three: `collab.spec.ts` uses a host and two
participants, and skips itself with fewer ([DeepSpace testing guide](https://docs.deep.space/guides/testing.md)).
No action deletes a competition, so a spec's competitions (titled `__test-<time>__ …`) stay
in the local room; delete `.wrangler/state` to start clean. Their files go to the real
platform storage and are removed in `finally`.

**Paid calls in tests:** none. The close-out email is not built yet; when it is, the job
will send it only when `ALLOW_DEBUG_ROUTES` is not `"true"` (the flag `deepspace dev` and
`deepspace test` set) and log the message otherwise.

**What is different locally:** with that flag set, `createCompetition` accepts a deadline
15 seconds ahead instead of an hour, so `close.spec.ts` can watch a competition close.

## On the deployed app

Done by hand on day 5 and after each deploy that touches the core loop: sign in with a
fresh account, create a competition from the demo files, submit from a second account,
watch the leaderboard in a third window, let a two-minute competition close. Check
`npx deepspace logs` for errors and `npx deepspace app usage` for spend.
