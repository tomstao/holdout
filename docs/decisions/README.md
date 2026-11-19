# Decisions

One file per decision: context, decision, consequences, alternatives. A decision changes
only through a new record that supersedes it.

| #                                                       | Decision                                                        | Status   |
| ------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| [0001](0001-build-on-the-deepspace-scaffold.md)         | Build on the DeepSpace scaffold as it comes                     | Accepted |
| [0002](0002-split-typescript-projects.md)               | Three TypeScript projects and stricter flags                    | Accepted |
| [0003](0003-eslint-typed-rules-and-prettier.md)         | Type-aware ESLint and Prettier, not Biome                       | Accepted |
| [0004](0004-zod-contracts-instead-of-openapi.md)        | Zod contracts as the API's source of truth, no OpenAPI document | Accepted |
| [0005](0005-one-room-roles-as-row-data.md)              | One record room; "host" is row data, not a role                 | Accepted |
| [0006](0006-answer-key-in-a-server-only-collection.md)  | The answer key lives in a closed collection                     | Accepted |
| [0007](0007-derive-the-leaderboard-from-submissions.md) | Derive the live leaderboard; keep private scores apart          | Accepted |
| [0008](0008-daily-limit-with-uniqueon-slots.md)         | Enforce the daily limit by claiming slots with `uniqueOn`       | Accepted |
| [0009](0009-close-with-cron-and-a-job.md)               | Close competitions with a cron task that enqueues a job         | Accepted |
| [0010](0010-score-inside-the-submit-action.md)          | Score inside the submit action, not in a background job         | Accepted |
| [0011](0011-datasets-in-host-files-behind-a-route.md)   | Datasets in the host's private folder, served by a Worker route | Accepted |
| [0012](0012-integrations-email-only.md)                 | One integration: the close-out email                            | Accepted |
| [0013](0013-docs-in-the-repo.md)                        | Keep the planning documents in the repository                   | Accepted |
| [0014](0014-source-control-github.md)                   | Ship from GitHub source                                         | Accepted |

Decisions marked "to confirm in spike Sn" are tested on day 1 ([plan](../plan.md#de-risking-spikes-day-1)).
