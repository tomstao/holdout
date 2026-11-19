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

Metric fixtures come from `scripts/fixtures/metrics.py` (scikit-learn 1.6 or later), run
once by hand; its JSON output is committed and the script is kept for regenerating.

## Playwright specs (`tests/`, `npx deepspace test run`)

| Spec             | Asserts                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`  | Real H1, no placeholder copy, app-specific `<title>`, a primitive opens, navigation test ids intact                                                 |
| `api.spec.ts`    | Action envelopes: 401 without a token, `invalid_input` with issues, `invalid_file`                                                                  |
| `rbac.spec.ts`   | A participant receives no `answer_keys` or `private_scores` rows through `useQuery` or the agent tools; no action response contains a private score |
| `collab.spec.ts` | Two participants: a submission appears on the other's open leaderboard without a reload                                                             |
| `limits.spec.ts` | Invalid file does not use a slot; the slot after the limit is refused with the reset time; a closed competition refuses                             |
| `close.spec.ts`  | A competition due in two minutes closes on its own; final standings and shake-up appear                                                             |

Accounts: `npx deepspace test accounts create` (at most 10 per machine); the multi-user
fixture signs them in ([DeepSpace testing guide](https://docs.deep.space/guides/testing.md)).
Seeded records are removed in `finally`.

**Paid calls in tests:** none. The close job sends email only when
`ALLOW_DEBUG_ROUTES` is not `"true"` (the flag `deepspace dev` and `deepspace test` set),
and logs the message it would have sent instead.

## On the deployed app

Done by hand on day 5 and after each deploy that touches the core loop: sign in with a
fresh account, create a competition from the demo files, submit from a second account,
watch the leaderboard in a third window, let a two-minute competition close. Check
`npx deepspace logs` for errors and `npx deepspace app usage` for spend.
