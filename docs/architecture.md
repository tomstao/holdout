# Architecture

How Holdout is built on DeepSpace: the layers and where files go, the data model and its
permissions, the server actions, the three main flows, the trust model and how
concurrency is handled. The product rules are in [spec.md](spec.md); the reasons for each
choice are in [decisions/](decisions/).

## System

```mermaid
flowchart LR
  subgraph Browser
    P[pages and features] -->|useCollection: live reads| WS
    P -->|callAction: writes| HTTP
  end
  subgraph Worker["App Worker (worker.ts, Hono)"]
    HTTP[POST /api/actions/:name] --> A[server actions]
    F[GET /api/competitions/:id/files/:kind]
    WS[/ws/... record subscriptions/]
  end
  subgraph DOs[Durable Objects]
    R[(AppRecordRoom app:APP_ID<br/>collections + RBAC)]
    C[AppCronRoom<br/>close-due-competitions, every minute]
    J[AppJobRoom<br/>close-competition]
  end
  subgraph Platform[DeepSpace platform]
    Auth[auth]
    Files[(app files, R2)]
    Mail[email/send]
  end
  WS --> R
  A -->|tools: RBAC off| R
  A -->|appFiles self scope| Files
  F --> Files
  C -->|enqueueJob| J
  J -->|records| R
  J --> Mail
```

- **Reads** go from the browser straight to the record room over the SDK's WebSocket. The
  room drops every record the caller's role may not read before sending it, so RBAC is the
  read boundary.
- **Writes** go through typed server actions only. No collection grants `create`,
  `update` or `delete` to any client role, so every write passes one validated,
  authorised code path ([ADR 0004](decisions/0004-zod-contracts-instead-of-openapi.md)).
- **Time-driven work** is a cron task that finds due competitions and a job that closes
  each one ([ADR 0009](decisions/0009-close-with-cron-and-a-job.md)).

## Layers and folders

Enforced by ESLint (packages) and dependency-cruiser (directories): `npm run lint`,
`npm run arch`. "Built" marks what exists today; the rest is the plan.

```text
holdout/
├─ worker.ts                 Worker entry (scaffold): route order, Durable Object classes
├─ src/
│  ├─ domain/                Pure TypeScript. No packages, no app imports, no Date.now/Math.random:
│  │  │                      time and seeds are arguments. Runs in both runtimes.
│  │  ├─ result.ts           Result of a function that can reject its input; issue log   (built)
│  │  ├─ csv.ts              RFC 4180 reader and writer; header lookup; size, row limits (built)
│  │  ├─ dataset.ts          validate train/test/solution; build the answer key; sample  (built)
│  │  ├─ split.ts            Usage column, or seeded stratified split by public share    (built)
│  │  ├─ predictions.ts      check a predictions file; line it up with the answer key    (built)
│  │  ├─ metrics.ts          accuracy, macro-F1, RMSE, MAE; which direction is better    (built)
│  │  ├─ scoring.ts          score predictions on the public and the private rows        (built)
│  │  ├─ ranking.ts          leaderboard, tie-breaks, final standings, shake-up            (built)
│  │  ├─ time.ts             deadline rule, UTC day key, daily reset time                (built)
│  │  └─ *.test.ts           unit and property tests; metric fixtures checked against scikit-learn
│  ├─ contracts/             Zod contracts shared by both runtimes                         (built)
│  │  ├─ define.ts result.ts action-client.ts schema-drift.ts                             (built)
│  │  ├─ actions.ts          action registry                                              (built, empty)
│  │  ├─ records.ts          record registry                                              (built)
│  │  └─ competitions.ts     record schemas of the five collections; action schemas later (built)
│  ├─ schemas.ts, schemas/   DeepSpace CollectionSchemas: storage columns and RBAC (scaffold location)
│  ├─ actions/               Server actions (Worker)
│  │  ├─ implement.ts records.ts index.ts fakes.ts (in-memory tools for tests)          (built)
│  │  ├─ create-competition.ts host-files.ts                                              (built)
│  │  ├─ submit-predictions.ts shared.ts                                                  (built)
│  │  ├─ update-competition.ts
│  ├─ server/                Hono routes (scaffold) + files-routes.ts, room-tools.ts,
│  │                         close.ts: the cron task's and the job's logic               (built)
│  ├─ cron.ts                close-due-competitions task, every minute                    (built)
│  ├─ jobs.ts                close-competition job                                        (built)
│  ├─ client/                Browser glue: callAction, useCollection                       (built)
│  ├─ features/              Browser features, one folder each: components + hooks
│  │  ├─ competition/        header, countdown; Leaderboard, Overview, Data, Submit tabs   (built)
│  │  ├─ create/             host form, local check of the files                           (built)
│  │  └─ home/               competition list for /home (later)
│  ├─ components/ui/         Base UI primitives kit (scaffold, restyled by the theme)
│  ├─ components/            App chrome: Navigation, ErrorScreen, Seo; FileDrop (shared CSV drop zone)
│  ├─ pages/                 Routes (generouted, file-based)
│  │  ├─ index.tsx           /            static landing, prerendered
│  │  ├─ (app)/home.tsx      /home        competition list
│  │  ├─ (app)/c/[id].tsx    /c/:id       competition page, public: header and four tabs (built)
│  │  └─ (app)/(protected)/host/new.tsx  /host/new   create form, sign-in required    (built)
│  └─ themes.css, themes.ts  the Holdout theme
├─ scripts/                  design-gate.ts                                                 (built)
├─ tests/                    Playwright specs run by `npx deepspace test run`
└─ docs/
```

Rules an agent should not have to guess:

- Domain code is plain functions over plain data. A function that can reject its input
  returns `{ ok: true, value } | { ok: false, issues, omitted }` (its own type in
  `src/domain/result.ts`: at most 20 issues, each with its row and column, and a count of
  the rest) and never throws for bad input; actions map that to a contract
  failure.
- A feature folder may import `src/client`, `src/contracts`, `src/domain` and
  `@/components/ui`; never `src/actions`, `src/server` or `deepspace/worker`.
- An action file exports one handler built with `implement(contract, handler)` and is
  registered in `src/actions/index.ts`.
- Pages stay thin: they read route params, pick a feature component and handle the
  not-found state.

## Data model

One record room, `app:<APP_ID>`, holds every collection; each row carries its
`competitionId` ([ADR 0005](decisions/0005-one-room-roles-as-row-data.md)). Times are
epoch milliseconds in `number` columns (not the SDK's `datetime`, which is seconds).

### Permissions

"Public" below means `{ read: true, create: false, update: false, delete: false }` for
`'*'` (signed out), `viewer`, `member` and `admin`. "Closed" means all four `false` for all
four roles, including `admin`, so not even the app owner's browser receives the rows
([ADR 0006](decisions/0006-answer-key-in-a-server-only-collection.md)).
A closed collection declares no `immutable` column: the room checks immutability before
permission, which would tell a client whether a guessed value is the stored one
([lessons](lessons.md#2026-11-19-day-2-data-model)).

| Collection        | Read                                | Written by                       | Unique on                                    |
| ----------------- | ----------------------------------- | -------------------------------- | -------------------------------------------- |
| `competitions`    | Public                              | create/update actions, close job | (record id)                                  |
| `answer_keys`     | Closed                              | create action                    | `competitionId`                              |
| `submissions`     | Public                              | submit action                    | `competitionId, participantId, utcDay, slot` |
| `private_scores`  | Closed                              | submit action                    | `submissionId`                               |
| `final_standings` | Public                              | close job                        | `competitionId, participantId`               |
| `users`           | Scaffold rules (own row; admin all) | platform                         |                                              |
| `settings`        | Scaffold rules (admin only)         | admin                            |                                              |

### Columns

`competitions` (record id: generated)

| Column                                  | Type (storage / meaning) | Notes                                                  |
| --------------------------------------- | ------------------------ | ------------------------------------------------------ |
| `title`                                 | text                     | required, max 80                                       |
| `summary`                               | text                     | required, max 200                                      |
| `description`                           | text                     | max 5,000                                              |
| `taskType`                              | text, select             | `classification`, `regression`; immutable              |
| `metric`                                | text, select             | `accuracy`, `macro_f1`, `rmse`, `mae`; immutable       |
| `idColumn`, `targetColumn`              | text                     | immutable                                              |
| `labels`                                | text, json               | `string[]` for classification, absent for regression   |
| `deadline`                              | number                   | epoch ms                                               |
| `dailyLimit`                            | number                   | 1 to 20                                                |
| `scoreDecimals`                         | number                   | 2 to 6                                                 |
| `testRows`, `publicRows`, `privateRows` | number                   | counts only; which rows are public stays secret        |
| `status`                                | text, select             | `open`, `closing`, `closed`                            |
| `closingStartedAt`, `closedAt`          | number                   | epoch ms, absent until set                             |
| `hostId`                                | text                     | required, immutable                                    |
| `hostName`                              | text                     | display name at creation                               |
| `files`                                 | text, json               | `{ train, test, sample }`, each `{ key, name, bytes }` |

`answer_keys` (record id = `competitionId`)

| Column          | Type       | Notes                                                                       |
| --------------- | ---------- | --------------------------------------------------------------------------- |
| `competitionId` | text       | required, immutable                                                         |
| `rows`          | text, json | `[id, target, split][]`, split `public`/`private`/`ignored`; at most 1.5 MB |
| `rowCount`      | number     |                                                                             |

`submissions` (record id: generated)

| Column            | Type   | Notes                                                                                                    |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `competitionId`   | text   | required, immutable                                                                                      |
| `participantId`   | text   | required, immutable. Set by the server, so no `userBound`                                                |
| `participantName` | text   | signed-out visitors cannot read the user directory                                                       |
| `fileName`        | text   | max 120                                                                                                  |
| `utcDay`          | text   | `YYYY-MM-DD`                                                                                             |
| `slot`            | number | 1 to `dailyLimit`: the daily-limit claim ([ADR 0008](decisions/0008-daily-limit-with-uniqueon-slots.md)) |
| `publicScore`     | number | unrounded                                                                                                |
| `rowCount`        | number |                                                                                                          |

`private_scores` (record id = `submissionId`): `submissionId`, `competitionId`,
`participantId`, `privateScore`.

`final_standings` (record id = `competitionId:participantId`): `competitionId`,
`participantId`, `participantName`, `rank`, `finalScore`, `publicRank`, `publicScore`,
`submissionCount`, `chosen` (json: `{ submissionId, publicScore, privateScore }[]`).

Each collection has a Zod contract in `src/contracts/competitions.ts` and a
`CollectionSchema` in `src/schemas/`; `schema-drift.test.ts` fails when they disagree.
A value that may be missing is optional in the contract, never `null`: the record room
stores `null` as no value and leaves the key out when the row is read.

## Server actions

All are `POST /api/actions/<name>` with a JWT, built with `implement()`: input validated,
output stripped to the contract. Failure codes come from `src/contracts/result.ts`.

| Action              | Input                                                                                                                                                                              | Output                                                      | Failures                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `createCompetition` | `title, summary, description, taskType, metric, idColumn, targetColumn, deadline, dailyLimit, scoreDecimals, publicShare, files: { train, test, solution }` (each `{ name, csv }`) | `{ competitionId }`                                         | `invalid_input`, `invalid_file` (+ issues), `internal`                                             |
| `submitPredictions` | `competitionId, fileName, csv`                                                                                                                                                     | `{ submissionId, publicScore, slot, dailyLimit, resetsAt }` | `not_found`, `forbidden` (host), `closed`, `limit_reached`, `invalid_file`, `conflict`, `internal` |
| `updateCompetition` | `competitionId` and any of `title, summary, description, deadline`                                                                                                                 | `{ competitionId }`                                         | `not_found`, `forbidden` (not host), `closed`, `invalid_input` (earlier deadline)                  |

One custom route: `GET /api/competitions/:id/files/:kind` (`train`, `test`, `sample`)
streams the dataset from the host's private file folder; public, cacheable, 404 for an
unknown competition or kind ([ADR 0011](decisions/0011-datasets-in-host-files-behind-a-route.md)).

## Flows

### Create

```mermaid
sequenceDiagram
  participant B as Host's browser
  participant A as createCompetition
  participant D as domain
  participant F as app files (host's self folder)
  participant R as record room
  B->>D: validate the three files locally (instant feedback)
  B->>A: callAction(input with the CSV texts)
  A->>D: validate again (authoritative), build the answer key and split
  A->>F: upload train.csv, test.csv, sample_submission.csv
  A->>R: create answer_keys (closed)
  A->>R: create competitions (public, status open)
  A-->>B: { competitionId }
```

The competition record is written last, so a failure part-way leaves no visible
competition. If a step fails, the action removes the answer key and the files it had
already stored and answers `internal`; if that clean-up fails too, what is left is an
answer key or a file nothing points to.

### Submit

```mermaid
sequenceDiagram
  participant B as Participant's browser
  participant A as submitPredictions
  participant R as record room
  B->>B: check header, row shape and labels locally
  B->>A: callAction({ competitionId, fileName, csv })
  A->>R: get competition (open? host? deadline > now?)
  A->>R: get answer key
  A->>A: validate rows against the key, score public and private (domain)
  A->>R: query today's submissions for the caller -> next slot n
  A->>R: create submissions { ..., utcDay, slot: n }  (uniqueOn refuses a taken slot)
  A->>R: create private_scores { submissionId, privateScore }
  A-->>B: { publicScore, slot, resetsAt }
  R-->>B: every open leaderboard receives the new submission
```

- The browser cannot check IDs (it does not have the answer key), so it checks shape,
  header and labels only; the server reports missing and unknown IDs.
- Validation and scoring happen before the slot is claimed, so an invalid file never uses
  a slot. If two submissions race for slot `n`, `uniqueOn` refuses one; the action
  recounts once and takes `n + 1`, or answers `limit_reached`, or `conflict` after a second
  collision ([ADR 0008](decisions/0008-daily-limit-with-uniqueon-slots.md)).
- If `private_scores` fails after `submissions` succeeded, the action deletes the
  submission and answers `internal`, so no public score exists without its private one.

### Close

```mermaid
sequenceDiagram
  participant C as cron (every minute)
  participant R as record room
  participant J as close-competition job
  participant M as email/send
  C->>R: query competitions with status open (and closing older than 10 minutes)
  C->>C: keep those with deadline <= now
  C->>R: set status closing, closingStartedAt
  C->>J: enqueueJob('close-competition', { competitionId })
  J->>R: read competition; stop if closed
  J->>J: wait until 10 s after the deadline
  J->>R: read submissions and private_scores
  J->>J: ranking.finalStandings() (domain)
  J->>R: upsert final_standings in chunks (ctx.continue between chunks)
  J->>R: set status closed, closedAt
  J-->>M: one email: host in "to", participants in "bcc" (not built yet: spike S8)
```

Every step can run twice without harm: standings have deterministic ids and the job stops
on a closed competition. The job waits ten seconds after the deadline before it reads, so
a submission that passed the deadline check in the last instant has finished writing; after
that the rows no longer change and every step computes the same standings. The logic is in
`src/server/close.ts`, as plain functions over the record tools and a clock.

## Trust model

| Threat                                                     | Defence                                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A participant reads the answer key or private scores       | Closed collections: the room never sends those rows to any role. Spec'd by a Playwright test over the record hooks and the agent tools |
| An action leaks a secret field in its response             | `implement()` parses output against the contract, which drops undeclared keys                                                          |
| A client writes a score, a submission or a competition     | No client role has create, update or delete on any app collection                                                                      |
| A caller acts on a competition they do not own             | Actions run with RBAC off, so each one checks `hostId` against the verified `userId` before writing                                    |
| The host submits to their own competition                  | `submitPredictions` refuses with `forbidden`                                                                                           |
| Probing the public leaderboard                             | Daily limit; final ranking on private rows; scores shown at the host's decimals                                                        |
| Someone overwrites a dataset file                          | Files live in the host's `self` folder, which only the host and the Worker can write (`app` scope lets any member overwrite: spike S3) |
| A member triggers the close task or enqueues the job early | The JobRoom refuses every client write (spike S7); the task and the job re-check `deadline <= now`, so an early run does nothing       |
| Spending the owner's credits                               | The only paid call is one email per closed competition, sent by the job                                                                |

Identity comes only from the verified JWT (`ctx.userId`); no action takes a user id from
its input.

## Time

- The server's clock decides: `Date.now()` in actions, cron and jobs, passed into domain
  functions as `now`.
- The daily limit uses the UTC day (`utcDay(now)`), resetting at 00:00 UTC.
- Deadlines are stored as epoch ms. The browser shows them in the viewer's time zone with
  the UTC time on hover.

## Limits and failure modes

| Limit                  | Value                                         | Where it is enforced                  |
| ---------------------- | --------------------------------------------- | ------------------------------------- |
| Answer key record      | 1.5 MB of JSON (UTF-8 bytes), 50,000 rows     | domain validation, before any write   |
| Action request body    | under 10 MB (train 5 + test 2 + solution 1.5) | contracts (`max` on each CSV string)  |
| App file allocation    | 1.0 GiB shown for this app (docs: 128 MiB)    | platform (`storage_quota_exceeded`)   |
| Records per query      | no cap from action tools: 5,000 rows, 1.97 MB | explicit `limit` and `offset` in code |
| Worker CPU per request | not documented; the largest submission scores | spec file sizes (spike S2)            |
| Record writes          | 1,000 per Worker request; about 28 ms each    | few per action; parallel in the job   |
| Leaderboard snapshot   | about 390 bytes per submission, in one frame  | spec limit of 5,000 submissions       |

The day-1 spikes measured these locally and on the deployed app
([lessons](lessons.md#2026-11-19-day-1-spikes-s1-to-s8)). Local `workerd` enforces none of
the platform's limits and is several times faster, so a number that matters has to come
from the deployed app.
