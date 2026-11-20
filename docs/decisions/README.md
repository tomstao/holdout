# Decisions

One file per decision: context, decision, consequences, alternatives. A decision changes
only through a new record that supersedes it.

| #                                                          | Decision                                                                 | Status                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| [0001](0001-build-on-the-deepspace-scaffold.md)            | Build on the DeepSpace scaffold as it comes                              | Accepted                      |
| [0002](0002-split-typescript-projects.md)                  | Three TypeScript projects and stricter flags                             | Accepted                      |
| [0003](0003-eslint-typed-rules-and-prettier.md)            | Type-aware ESLint and Prettier, not Biome                                | Accepted                      |
| [0004](0004-zod-contracts-instead-of-openapi.md)           | Zod contracts as the API's source of truth, no OpenAPI document          | Accepted                      |
| [0005](0005-one-room-roles-as-row-data.md)                 | One record room; "host" is row data, not a role                          | Accepted                      |
| [0006](0006-answer-key-in-a-server-only-collection.md)     | The answer key lives in a closed collection                              | Accepted; S1 confirmed        |
| [0007](0007-derive-the-leaderboard-from-submissions.md)    | Derive the live leaderboard; keep private scores apart                   | Accepted; S6 confirmed        |
| [0008](0008-daily-limit-with-uniqueon-slots.md)            | Enforce the daily limit by claiming slots with `uniqueOn`                | Accepted; S4 confirmed        |
| [0009](0009-close-with-cron-and-a-job.md)                  | Close competitions with a cron task that enqueues a job                  | Accepted; S5 and S7 confirmed |
| [0010](0010-score-inside-the-submit-action.md)             | Score inside the submit action, not in a background job                  | Accepted; S2 confirmed        |
| [0011](0011-datasets-in-host-files-behind-a-route.md)      | Datasets in the host's private folder, served by a Worker route          | Accepted; S3 confirmed        |
| [0012](0012-integrations-email-only.md)                    | One integration: the close-out email                                     | Accepted; S8 confirmed        |
| [0013](0013-docs-in-the-repo.md)                           | Keep the planning documents in the repository                            | Accepted                      |
| [0014](0014-source-control-github.md)                      | Ship from GitHub source                                                  | Accepted                      |
| [0015](0015-theme-status-colours-and-self-hosted-fonts.md) | The theme sets its own status colours; fonts are served by the app       | Accepted                      |
| [0016](0016-serve-only-what-the-app-uses.md)               | The Worker serves only what the app uses: unused scaffold routes removed | Accepted                      |

The day-1 spikes ([plan](../plan.md#de-risking-spikes-day-1)) tested the open questions,
locally and on the deployed app; each record ends with its result. S8 (the email) was run
on 2026-11-20 with one send to two of the owner's inboxes
([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)).
