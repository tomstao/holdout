# DeepSpace capabilities for Holdout

> How this was made: a research agent answered 13 design questions from
> the DeepSpace docs, the official skill and two example apps, quoting
> each source. `L1234` references are lines of
> <https://docs.deep.space/llms-full.txt> as downloaded on 2026-11-19
> (docs stamped `deepspace@0.43.0`); if lines have moved, search for the
> quoted text.
>
> **Checked against the installed SDK (0.44.2, `node_modules/deepspace`),
> which wins where the docs lag:**
>
> - `tools.update` is a shallow merge patch (`{ ...existing.data, ...data }`)
>   and fails on a missing record; `immutable` columns are enforced
>   (`dist/worker.js`, `putRecord`). The old full-replace note from `tally`
>   is obsolete.
> - `records.query` pages with `offset` and returns `nextOffset`; a page is
>   capped at about 30 KB and flagged `truncated` when cut. The docs say
>   there is no pagination.
> - `useQuery<T>(collection: string, ...)` and `ActionContext.params:
Record<string, unknown>` are untyped (`dist/index.d.ts`,
>   `dist/worker.d.ts`).
> - `appFiles` scopes are `self` (private to that user; the Worker can read
>   it) and `app` (public). Single-request upload limit 25 MiB; files up to
>   1 GiB in parts.
> - `email/send` costs $0.013 per request and always sends from
>   `notifications@updates.app.space`; `from` is ignored, use `reply_to`
>   (`npx deepspace integrations info email/send`). The docs' advice to send
>   from `<app>@app.space` is out of date.
> - `vite build` and the scaffold's Vitest config refuse to load until
>   `wrangler.toml` has a registered app id (`deepspace/build`,
>   `resolveAppId`).

Sources and citation format:

- `L1234` = line in the local docs copy `scratchpad/ds/llms-full.txt` (23,795 lines). The docs' own SDK version stamps: guides "written for `deepspace@0.43.0` ... Docs checked: October 29, 2026" (L3028); `maxLength` is "not in the published 0.42.3 SDK" (L20716).
- `SKILL.md:N` = `deepdotspace/deepspace-skill` `skills/deepspace/SKILL.md` (the only real file in that repo; `references/README.md` is a placeholder).
- `tally:` / `threadhunt:` = example apps `deepdotspace/tally` and `deepdotspace/threadhunt` (both pinned to the much older `"deepspace": "^0.23.2"`). Treat them as evidence of how real apps work, not as docs.
- "Not documented" means I grepped the full corpus and found nothing. "Inference" marks my reasoning, not doc text.

---

## Design constraints up front (read this first)

1. **Server-only collection: yes.** Set every role (including `admin`) to `{ read:false, create:false, update:false, delete:false }`. Server actions, cron and jobs still read and write it because their `tools` / `ctx.records` calls bypass RBAC. One catch: the app owner is pinned to `admin`, so give `admin` read access only if you want the owner's browser to see the answer key.
2. **Per-competition roles are not a supported feature.** Roles live on the `users` row of a RecordRoom. The scaffold's cron and job rooms resolve the role from the app room only. There is no documented API to make someone "host in competition A, participant in B". You can get that partly through custom code: a per-room `ownerUserId` (the documented `accountStores` pattern), or `setRole` called by an admin of that room. Both are undocumented for this use. Recommendation: **one app RecordRoom, a `competitionId` column, and per-competition rights expressed as row data** (`ownerField`, `collaboratorsField`, `teamField` + `team_members`).
3. **No atomic read-modify-write.** No CAS, conditional write or transaction exists. Each `tools.*` call is a separate request to the DO, so `get` then `update` can interleave with a concurrent action. Two documented tools serialize work:
   - `uniqueOn`: the DO refuses a duplicate on create or update.
   - A JobRoom: it "runs one handler at a time".

   Build submission caps and best-score updates on those two.

4. **Typing is manual.** Record types are not inferred from schemas; you write the `T` in `useQuery<T>` yourself. Actions are `params: Record<string, unknown>` returning `ActionResult<unknown>`. There is no typed web action client (the example apps hand-roll `callAction`), no Zod integration for actions, and no OpenAPI generation. Plan on a shared types/Zod module of your own.
5. Other constraints that bite:
   - **Range queries:** there is no `>`/`<`/range filter anywhere (`where` is exact-match only), so "deadline passed" checks happen in JS.
   - **File storage:** the free plan has a **128 MiB file allocation for the whole app**.
   - **Local uploads:** uploads return 401 locally until the first deploy.
   - **Signed-out leaderboard:** signed-out visitors get **no user directory**, so the public leaderboard must store display names on its rows.
   - **Job privacy:** job rows (payload and result) are visible to every member subscribed to that JobRoom by default, so never put private scores in a job result.

---

## 1. Collections and RBAC

**Schema declaration.** A schema object with `name`, `columns`, `permissions`, registered in `src/schemas.ts`. It is baked into the worker at deploy time.

- "Schemas live under `src/schemas/`, with the full list exported from `src/schemas.ts`. Every schema has `name`, `columns`, and `permissions`" (L9298)
- "Schemas are **baked in at deploy time** - there is no runtime schema registry. Adding or changing a schema requires a redeploy." (L9327)

**Column types.** Two storage types, plus an interpretation:

- "`storage` picks the underlying SQLite column type - `'text'` becomes a `TEXT` column, `'number'` becomes a `REAL` column." (L9340)
- Interpretations (L20726-20738): `plain | currency | date | datetime | boolean | percent | select | multiselect | url | email | json | reference`.
- Column flags (L20680-20698): `id`, `expression` ("SQL expression for a computed column (read-only)"), `userBound` ("Auto-populate with the current user ID on create"), `immutable`, `required`, `default`, `timestampTrigger`.
- Booleans are stored as 0/1; date and datetime on number columns are Unix seconds (L9338). Caveat: `timestampTrigger` writes "**epoch milliseconds** (`Date.now()`) on a `'number'` column" (L20709).

**JSON columns.**

- "`{ kind: 'json' }` | `'text'` | Auto `JSON.stringify` on write, auto `JSON.parse` on read." (L9356)
- Server side: "**JSON columns arrive parsed.**" in `tools.get` / `tools.query` (L13537).

**Indexes: not documented.** `CollectionSchema` (L20646-20674) and `ColumnDefinition` (L20680-20698) have no index option. The only `CREATE INDEX` in the docs is for a custom D1 database (L15054). Uniqueness: `uniqueOn?: string[]` is a composite constraint "Enforced in the DO on every write path" (L20651-20657).

**Scale guidance.** "DeepSpace records are tuned for **operational data** - collections of hundreds to tens of thousands of small rows" (L9460). Store files in R2, not in records (L9462).

**Roles and how they are assigned.**

- "Every user has a role on each app's RecordRoom. The built-in roles are:" `viewer` (read-only users or unauthenticated), `member` ("All authenticated users"), `admin` ("Explicitly promoted users") (L9488-9494).
- "New authenticated users get `member` by default. Override that with `defaultRole` on the users schema. The only in-SDK way to promote a user is `useUsers().setRole(userId, 'admin')`, which the server rejects unless the caller is already an admin. The app owner is pinned to `admin` at connect time" (L9496)
- Custom roles: "`setRole` accepts a free-form role string (e.g. `'admin'`, `'intern'`, or any value your schema understands)" (L18869); "`Role` is defined in `src/constants.ts` - extend it there to add new roles, then use them in permissions" (L10553). `permissions: Record<string, RolePermissions>` (L20671).
- Storage location: "the role stored on their `users` row" (L13873).
- Server-side: `tools.registerUser({ isAdmin })` "forces the role to `'admin'`. Pass it only when the worker has derived admin status from the **verified JWT**" (L21067).
- Anonymous: "Unauthenticated callers use the `'*'` wildcard key" (L9498). Later on the same page: "Anonymous connections have role `viewer`. The exact role rule is used when present; `*` is only the fallback." (L9690-9692). The page contradicts itself, so set `'*'` and `viewer` identically, as every docs example does.

**Server-only collection (no role can read; actions still can): YES.**

- Documented "closed" pattern: `const closed = { read: false, create: false, update: false, delete: false };` applied to `'*'`, `viewer`, `member` (L7192-7217). The same pattern appears at L2160, L3070, L3418, L5484, L6532 and L7461.
- RBAC bypass for server code:
  - "**Bypassing RBAC requires a server action.** ... they call privileged worker code with the `X-App-Action` header, which bypasses RBAC" (L9643)
  - "`tools.query` bypasses caller RBAC - your action sees every record in the collection" (L13531)
  - Cron: "`buildCronContext` runs as the app owner and bypasses permissions, so the task can read the admin-only `recipients` collection" (L7286)
- Inference: an all-`false` permissions block that includes `admin` is valid per the types: "All four of `read`, `create`, `update`, `delete` are required on every role entry" (L20766), and nothing requires any role to be able to read. Records never ship to clients that fail the read check: "The DO drops records the caller can't read **before** sending them over the WebSocket" (L9484).
- Gotcha: "Server actions bypass the projection entirely ... reads **full rows**, email included ... Never return a raw `users` row from an action" (L9664).
- Debug routes: `/api/debug/*` exposes RecordRoom internals but is "gated on `ALLOW_DEBUG_ROUTES` (set by `deepspace dev start` / `test run`, never in production)" (L9142).

**Owner-scoped rules: YES.**

- "`'own'` | Caller is the owner. Default: `record.createdBy === userId`; override with `ownerField`." (L9520)
- "A private user-scoped collection ... `member: { read: 'own', create: true, update: 'own', delete: 'own' }` ... Each user sees only their own records." (L9627-9635)
- Use `ownerField` together with `userBound: true`: "A client can create a row with someone else's id in this field" otherwise (L20886). When only server code writes the collection, don't use `userBound`: "it would stamp the writer's id over the intended owner" (L20893).
- Group levels: `'published'` (owner OR visibilityField), `'shared'` (owner OR collaborators OR visibility), `'team'` (owner OR collaborators OR `team_members` membership via `teamField`) (L9521-9529, L9557-9559).
- "If a schema declares a `visibilityField`, the DO re-evaluates read access on every update" and broadcasts gains and losses of access (L9784). This is useful for a private-leaderboard reveal. Caveat: `'published'` always includes the owner, so a submitter would see their own row before reveal.
- Not documented: what `createdBy` is when a server action creates a row. threadhunt's tools factory sends `'X-User-Id': userId` (the caller) on every tool call (`threadhunt: worker.ts` L839-858), which suggests the caller.

**Field-level permissions: write-side only.**

- "`writableFields?: string[]` — If set, this role may only supply the listed columns on create or update." (L20751-20752)
- "`writableFields` restricts **both create and update**" (L20768)
- Also `immutable`, `userBound` and `uniqueOn`.
- **Field-level read masking: not documented.** Read rules are whole-row. The one projection is the built-in users directory (L9650). To hide a field, split it into a separate collection.

## 2. Scopes and rooms

**One RecordRoom per scope, not per app.** The app's main room is `app:<APP_ID>`, and you can mount others.

- "A scope is a namespaced identifier that determines which DO instance you're talking to." Rows: "`app:<APP_ID>` | Your app's main RecordRoom", "`chat:<channelId>` | An optional isolated room", "Any app-defined name | Another isolated room owned and authorized by your app" (L9176-9182)
- "A `RecordScope` is a single Durable Object that holds all the collections and records mounted inside it. The `roomId` is the DO's identifier - picking a different `roomId` gives you a separate DO with isolated data." (L9420)
- "There are no user-scoped DOs, by design. ... user-scoped data lives in app DOs as collections with RBAC filtering" (L9186). The mobile guide contradicts this with `accountStores` (L12864).
- Nested `<RecordScope roomId=... schemas=...>`, `sharedScopes`, `isolated` (L18639-18650).

**Partitioning per competition: two options.**

- (a) **One app room plus a `competitionId` column.** Everything server-side is wired to the app room by default:
  - cron: `buildCronContext(env, ownerUserId, roomId?)` with "`roomId` defaults to `'default'`. Pass `app:${env.DEEPSPACE_APP_ID}`" (L21709);
  - jobs: `enqueueJob(..., roomId, ...)` (L20550-20564);
  - action tools: built by an app-owned factory, "the factory that builds the tools lives in your app (`src/server/action-routes.ts`)" (L13533). In threadhunt the factory hard-codes one room: `env.RECORD_ROOMS.idFromName(\`app:${env.APP_NAME}\`)` (`threadhunt: worker.ts` L840).
- (b) **Room per competition**, e.g. `comp:<id>`. Possible, but you must change the tools factory to take a roomId, loop cron over rooms, and stop clients from minting arbitrary room names. The template `wsRoute` opens any `:roomId` (`threadhunt: worker.ts` L529-553: `ns.get(ns.idFromName(id))`).
- Recommendation (inference): (a).

**Per-competition roles: not documented as a feature. Roles are effectively app-wide.**

- Role is per RecordRoom, stored on that room's `users` row (L9488, L13873). `useUsers()` "Returns the room's user directory with role-management helpers" (L18845).
- The scaffold's cron and job write checks resolve the role from the **app** room: "resolves each authenticated caller's **current app role** via `resolveAppRole` (owner → `admin`; otherwise the role stored on their `users` row)" (L13873). threadhunt comment: "`resolveAppRole` reads the users collection out of the RecordRoom named `app:${DEEPSPACE_APP_ID}`" (`threadhunt: worker.ts` L56-58).
- The closest documented per-room-admin mechanism is mobile `accountStores`: `super(state, env, schemas, { ownerUserId: stores.ownerOf(env, state.id.name) ?? undefined })` ... "each room's account is its only admin" (L12872-12887). `RecordRoomConfig.ownerUserId` "Automatically gets the `admin` role on connect" (L20328-20331). By inference you could derive a host id from a room name like `comp:<hostId>:<slug>`, but that gives one admin per room and is undocumented for this use.
- Recommendation: express "host of competition X" as row data:
  - `competitions.hostId` with `ownerField` + `userBound` + `immutable`;
  - `collaboratorsField` (e.g. `hostIds`) on rows hosts must read, with `read: 'collaborator'`;
  - or `teamField: 'competitionId'` plus a `team_members` collection (`teamId`, `userId`, `status`), which "must declare `teamId`, `userId`, and `status` columns" (L9559);
  - plus server-action checks.

## 3. Server actions

**Limits:**

- CPU, memory, wall time and request-body size for actions: **not documented.**
- Related numbers that are documented:
  - "`waitUntil` is killed 30 seconds after the response goes out" (L13950)
  - "Streaming response | Custom Hono route (actions don't stream)" (L13645)
  - JobRoom's `backgroundJobTypes` "does not increase Worker CPU or memory limits" (L14046), which implies limits exist without stating them
  - the file gateway: "One HTTP request carries at most **25 MiB**" (L11877)
  - agent tool calls: "a tool call carries at most 64 KiB" (L11932)
  - logs can show `outcome` `exceededCpu` (L23669)
  - threadhunt chunks work so it "never trips the Worker subrequest ceiling" (`threadhunt: src/jobs.ts` L9). Each `tools.*` call is one subrequest to the DO.
- HTTP behavior: "HTTP status is 200 on success, 401 if unauthenticated, 404 if the action name doesn't exist, 500 on uncaught throws." (L21141). Actions require a JWT (example route: `if (!auth) return c.json({ error: 'Unauthorized' }, 401)`, `threadhunt: worker.ts` L695-698).

**Reading uploaded bytes from the worker: YES, via `appFiles`.**

- "Agent tools, crons, and server actions run in your Worker ... They store files with `appFiles` from `deepspace/worker`" (L11856)
- `download(key: string): Promise<Response>` "The bytes as a streaming Response." (L22470-22471)
- `appFiles(env, { scope: 'self', userId })`: "'self': the user's private folder" (L22461-22464)
- "Pass a user id your app has verified, never one from request input: the platform trusts it because the request carries your app's identity." (L11869)
- Needs one deploy first: "it needs the app deployed once (`APP_IDENTITY_TOKEN`)" (L22455)
- Upload is "One request, up to 25 MiB" (L22469). A download size cap is not documented.
- Alternative: a custom R2 binding the worker reads directly (`[[r2_buckets]] binding = "FILES" bucket_name = "auto"`, L14966-14969). Whether it counts against the plan's file allocation is not documented.

**Atomicity of get-then-update: NOT atomic. No CAS, conditional write or transaction exists** (grep for atomic/transaction/compare-and-swap/conditional finds nothing for records).

- What the docs guarantee: "The DO owns its SQLite database and serializes all writes" (L9715). "**Writes are serialized inside the DO.** Two concurrent `put`s land in a deterministic order - the second wins on field-level merge." (L9775). That is per-write ordering only.
- The guide claims actions can do "updating two collections atomically" (L13433). But each tool is its own request. threadhunt's `execTool` does `stub.fetch(new Request('https://internal/api/tools/execute', ...))` once per call (`threadhunt: worker.ts` L845-858). Inference: other requests can run between your `get` and your `update`, and a crash between two writes leaves partial state.
- The docs' own per-user daily cap does query-then-create (`tools.query('usage', ...)` then `tools.create('usage', ...)`, L6340-6346), so it is racy too.
- `tools.update` semantics: the docs say "`tools.update(coll, id, patch)` | Patch an existing record." (L13513). tally (SDK 0.23) says "`tools.update` is a full-replace (no merge), so partial updates need a get -> merge -> update dance" (`tally: src/actions/_helpers.ts` L4-5). Verify against the installed SDK.
- `tools.create(coll, data, recordId)` is an upsert: "the incoming `data` is merged on top of it" (L13549). That is not a CAS.
- What you can use:
  - `uniqueOn`: "the Durable Object checks it on every create and update before the row is written - so 'one vote per user per poll' ... hold against a forged or replayed client write" (L9582). Violations return `success: false` "Duplicate: ..." (L9600). Inference: a cap of N submissions per day can be enforced atomically with `uniqueOn: ['competitionId','userId','day','slot']` and slot in 1..N.
  - A JobRoom: "JobRoom runs one handler at a time" (L20531). If one job type is the only writer of a leaderboard row, its read-modify-write is serialized. Retries and recovery can re-run a handler: "Write handlers so a retry does not duplicate completed side effects." (L14068)
  - A custom DO or D1. "You can add your own Durable Object classes or subclass these with custom behavior." (L9170). D1 is available via custom bindings (L14977-14981). Their transactions are Cloudflare-native, not DeepSpace-documented.

**Action typing:** see Q9.

## 4. File uploads (`useR2Files`)

**Visibility.** Two scopes only.

| Scope              | Prefix                        | Reads (L11843-11846)                                                            |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------- |
| `'self'` (default) | `apps/<app>/users/<userId>/…` | "Only that user: their bearer token, or their session on your app's own origin" |
| `'app'`            | `apps/<app>/…`                | "Public - the URL works directly as an `<img src>`"                             |

- "**`scope: 'app'` uploads are world-readable.** ... never put private data there." (L11850). "Anyone who knows or guesses the key can fetch them without signing in." (L19597)
- Admins or the owner cannot read others' `self` files: "Should the app owner be able to open everyone's private files? (With the built-in private storage, they cannot.)" (L7414). Also "the owner cannot open other people's private files" (L7635).
- Group sharing is not built in: "A file shared with a chosen group but hidden from the public is not one of the built-in levels." (L7406). "Not built in: a scope that shares a private file with a chosen group ... The docs point to declaring a separate R2 bucket through custom bindings" (L7645).
- Private to the uploader **and** readable by the worker: yes. The worker reads `self` files with `appFiles(env, { scope: 'self', userId })` (Q3). So the host's answer key goes in the host's `self` folder, and participants' predictions in their own.
- Writes: "Writes always require a signed-in user, under either scope. There is no recycle bin" (L11852). Who may overwrite or delete an `'app'`-scope key someone else uploaded: **not documented.**
- Blocked types: HTML, SVG and JS uploads are refused by declared type (L11879).
- Metadata: `R2FileInfo` = `key, size, uploaded, url, originalName?, uploadedBy?` (L19561-19568). There is no MIME type; keep a sidecar record.

**Size limits:**

- "A file can be up to **1 GiB**. One HTTP request carries at most **25 MiB**, so both `useR2Files` and `deepspace app files put` automatically upload anything above **20 MiB** in parts" (L11877).
- Per app: "**Your app's whole file allocation is capped by the owner's plan** — 128 MiB on the free plan, more on paid ones. ... refused with `storage_quota_exceeded` (HTTP 409)" (L11881).
- Worker `appFiles.upload`: 25 MiB per call (L11869).

**Downloads for other users.** `getUrl()` "returns a plain URL with no auth token attached. It works for unauthenticated reads" (L11773). That only works for `'app'` scope: "`getUrl()` attaches no auth token, so it works for `'app'`-scope files but not `'self'`-scope ones. For private files use `readFile` or `downloadFile`" (L19599). A `self` file "renders ... on your app's own pages for the signed-in user it belongs to, and for nobody else" (L11850). For data only participants should get (train/test), the options are:

- `'app'` scope (public to anyone with the URL), or
- a custom worker route that checks membership and streams `appFiles(...).download(key)` (inference from documented APIs).

**Local development:** "R2 uploads require an `APP_IDENTITY_TOKEN` minted by the deploy worker. Until the app has been deployed at least once ... `upload()` round-trips return 401" (L11952).

## 5. Scheduled jobs (CronRoom)

**Granularity and timezone.** "Each task declares **either** `intervalMinutes` (every N minutes) **or** `schedule` + `timezone` (a 5-field cron expression evaluated against an IANA timezone). Declaring both, or neither, throws at DO construction time." (L13728). Timezone: "IANA timezone (DST-aware)" (L13735); "Cron mode is DST-aware - the wall-clock comparison happens after the timezone shift." (L21657). Timezone is required with `schedule` (L20434).

- **Minimum interval: not stated.** Fields are minutes, and `intervalMinutes: 1` is the documented example (L13702, L13922). So effective granularity is 1 minute. There are no seconds.

**Arming.** "A Durable Object does not exist until something fetches it, and `CronRoom` arms its alarm inside that first fetch." The template's `armCronRoom` middleware and the deploy's wake request handle this (L13784-13787).

**Cron context.** It runs as the owner and bypasses RBAC (L13740).

- "`ctx.records.query` accepts `{ where?, limit? }` only - there is no `orderBy`/`orderDir` here ... There is no `ctx.records.get(...)`" (L13760).
- Methods throw on failure (L13762).

**Per-record deadlines.** The docs have no per-record "run at time T" API. Options:

- **An every-minute cron that scans: documented, and what real apps do.** threadhunt: "One task: `tick` - every hour, scan topics whose nextDueAt has passed. The per-topic cadence lives on each topics row, not in the task list." (`threadhunt: src/cron.ts` L7-8). Because `where` is equality-only (L13531, L18689), query `{ status: 'open' }` and compare `closesAt <= now` in JS.
- A one-off job scheduled for a time is not documented. `ctx.continue(state, { afterMs })` exists ("Checkpoint state and yield to the next alarm tick", L14002, L20525). Using a long `afterMs` as a timer is undocumented: no max delay is stated, and JobRoom runs one handler at a time.
- A DO alarm is possible only in a custom DO. `BaseRoom` exposes `protected onAlarm?(): void | Promise<void>` (L20299), and custom DO classes are allowed (L9170). There is no SDK helper.
- Recommendation (inference): cron at `intervalMinutes: 1` closes and reveals competitions. **Also enforce `now < closesAt` inside the submit action**, so correctness does not depend on cron latency. Make the task idempotent.

**`useCronMonitor(roomId)`** returns `tasks` ("Live state of each task", with `nextRunAt`/`paused`), `history` ("Recent runs (with success, duration, error)"), `connected`, `canWrite`, `lastError`, and `trigger(name)` / `pause(name)` / `resume(name)` returning a `CronMutationResult` receipt (L13860-13871). Caveat: "**Members and admins can fire owner-billed tasks by default.** ... For admin-only writes, customize the route's role resolver" (L13873). Runs log `[cron] <task> ok <ms>ms` (L13793). `npx deepspace add cron` installs a read-only monitor page (L13919-13922).

## 6. Background jobs (JobRoom)

**When to use a job instead of an action.**

| If the work…                                                              | Use (L13956-13961)                    |
| ------------------------------------------------------------------------- | ------------------------------------- |
| Finishes inside the HTTP response                                         | A regular Hono route or server action |
| Runs on a schedule                                                        | Scheduled tasks                       |
| Is triggered by a user click and may take seconds to more than 15 minutes | **Background jobs**                   |
| Is triggered by the worker and needs to outlive the response              | **Background jobs**                   |

**Progress:** "`ctx.progress(value, message?)` | Broadcast progress (0..1). Re-renders any `useJobs` subscriber." (L14000). `useJobs(roomId)` gives a live `jobs: JobView[]` with `status`, `progress`, `result`, `error`, plus `enqueue`, `cancel` and `retry` (L19343-19375). Enqueue from the worker with `enqueueJob(namespace, roomId, type, payload?, opts?)` (L20550-20562).

**Retries and limits** (L14146-14153):

- "Retry on throw | None (`maxAttempts: 1`)"
- "Retry backoff | 1 s"
- "Terminal-row retention | 24 h"
- "Alarm wall-time limit | 15 min | Split work with `ctx.continue(state)`, or list its type in `backgroundJobTypes`"
- "Crash recovery | Auto | Orphaned `running` rows older than ~16 min are rescued on a DO wake-up"
- "JobRoom runs one handler at a time" (L20531). `backgroundJobTypes` "does not change CPU or memory limits" (L20531).
- The result "**must be JSON-serializable**" (L13994).
- Handlers write records via `buildCronContext` (`threadhunt: src/jobs.ts` L33). The docs only say "Handlers run as the app owner, just like scheduled tasks" (L14166).

**Who sees jobs.**

- `authorizeWrite` defaults to member/admin, and "`authorizeRead` ... Defaults to authorizeWrite" (L20490-20493).
- "Every connected subscriber sees the same state transitions in real time." (L14076)
- Inference: by default **every member can see every job's `payload` and `result` in that JobRoom.** Never return private-leaderboard scores from `onJob`, or tighten `authorizeRead`, or use a room per competition.
- Paid jobs: "Tighten it to admin-only for jobs that spend owner credits." (L13952)

**Does scoring a 5 MB CSV belong in a job?** The docs give no number for this.

- Arguments for a job: it is durable, retryable, shows progress, and is serialized. Serialization is a real plus for atomic best-score updates (Q3).
- Arguments against: one handler at a time per JobRoom means a submission burst queues behind itself, and the default member visibility applies.
- Inference: parsing and scoring 5 MB is seconds of CPU at most, so an action could do it synchronously. Worker CPU limits are not documented, though, so measure it.
- Recommendation: a job keyed to a per-competition JobRoom id, holding only an opaque result (e.g. `{ ok: true }`), with scores written to RBAC-protected collections.

## 7. Real-time queries

**Subscription.** "When a client calls `useQuery`, the SDK sends a `core.subscribe` message. The DO replies with a `core.query_result` snapshot ... From that point forward, the DO pushes incremental updates as `core.record_change` messages" (L9761). Updates move records in and out of the `where` set (L9763-9771).

**Options:**

- `where?: Partial<T>`, `orderBy?: string`, `orderDir?: 'asc' | 'desc'`, `limit?: number` (L18657-18664).
- "`where` filters by exact field match. Filtering happens server-side before broadcast" (L18689).
- "`orderBy` accepts any field name including `createdAt` and `updatedAt`. `limit` caps the records sent over the wire." (L18699)
- **No range, OR or IN filters** are documented, despite "Pick `'number'` for any column you want to range-query" (L9340).

**Pagination: none.**

- "**Use `limit` on long lists.** Initial subscription sends every matching record. ... (Cursor pagination is on the roadmap.)" (L10782)
- "Identical queries deduplicate to one WebSocket subscription" (L10783)
- How `limit` behaves for a live top-N as rows enter or leave: not documented.

**Live updates for records changed by a server action: yes.**

- Every accepted write broadcasts. "**Broadcast.** The DO sends a `core.record_change` envelope ... to every connected client whose RBAC allows read access, including the sender." (L9451)
- "When any user (including you) creates, updates, or deletes a record, every open client sees the change within milliseconds." (L9396)
- Action writes go through the same DO tools API (L9643, L20933). The docs don't say "action writes broadcast" in so many words, but real apps depend on it: threadhunt "Clients never write records directly; every mutation flows through these actions" (`threadhunt: src/lib/api.ts` L1-5) while its pages render from `useQuery`.

## 8. Auth: public leaderboard and page gating

**Signed-out visitors can read public collections: YES.**

- "Fully public ... Keep `<RecordProvider allowAnonymous>` - it's already on in the scaffold's `(app)/_layout.tsx`. Signed-out visitors get the records that the `'*'` role rule in permissions grants read access to." (L10373)
- `allowAnonymous` "Connect without a JWT (default `false`). Required for public pages." (L18593)
- Without it, "A `<RecordProvider>` without `allowAnonymous` renders **nothing** when the visitor is signed out." (L10577)
- Set both `'*'` and `viewer` (Q1 note on L9498 vs L9690).
- **Names on a public leaderboard:** "**Anonymous sockets receive no directory.**" (L9649). Store display names on the leaderboard rows.

**Page tiers** (file-based routing, generouted):

| Location                            | Providers (L1143-1147)                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `src/pages/*.tsx`                   | "None - Static pages"                                                     |
| `src/pages/(app)/*.tsx`             | "`DeepSpaceAuthProvider` + `RecordProvider` ... Sign-in **not** required" |
| `src/pages/(app)/(protected)/*.tsx` | "The above, plus `<AuthGate>`"                                            |

- "**Never treat `<AuthGate>` as server authorization.** It stops the UI from rendering, not the WebSocket from upgrading" (L10367). The server boundary is `wsRoute`'s token check plus the `'*'` rules.
- A fully private app replaces the optional-token block in `src/server/realtime-routes.ts` (L10356-10363).

## 9. Type safety

**Record types are declared by hand, not inferred.**

- `useQuery<{ title: string; completed: boolean }>('todos')` (L9288).
- "TypeScript catches this if you pass a row type to `useQuery<Note>`" (L10674).
- `CollectionSchema` is a plain typed object (L20646). No `InferRecord`-style helper or schema-to-type inference is documented (grep found none).
- Collection names are plain `string` (L18658, L18741).

**Server actions are loosely typed.**

- `type ActionHandler<TEnv = Record<string, unknown>> = (ctx: ActionContext<TEnv>) => Promise<ActionResult>` (L20945-20946). `ActionResult<TData = unknown>` (L21085), so the output data is `unknown`.
- `params: Record<string, unknown>      // request body` (L20967).
- The docs cast inline: `const eventId = params.eventId as string` (L13456).
- Generics exist on `tools.get<T>` / `query<T>` (L21001-21014) and on `JobRoom<E, P, R>` (L20533). Cron `records.*` "return `unknown`" (L21711).

**Typed action client: none for the web.**

- The docs call actions with raw `fetch('/api/actions/inviteAttendee', ...)` and `res.json() as ActionResult` (L21128-21138).
- `callAction` exists only in the mobile entry: `import { callAction, integration } from 'deepspace/native'` (L12933). It isn't shown as typed.
- Both example apps hand-roll one: "The SDK ships useQuery/useMutations for record CRUD but no hook for server actions, so this thin auth+JSON wrapper..." (`tally: src/lib/actions-client.ts` L1-5); `callAction<T>(name, body)` (`threadhunt: src/lib/api.ts` L17).

**Zod:**

- Used for AI and agent tool definitions: `inputSchema: z.object({ city: z.string() })`, "The Zod `inputSchema` doubles as runtime validation" (L12246, L12258).
- The api-worker validates integration bodies with Zod (L14396).
- Nothing for server actions or schemas. Both example apps list `zod` in their dependencies.

**OpenAPI:** no generation for worker routes. The only OpenAPI feature is input for the documentation site: `"openapi": [{ "source": "openapi.json", "playground": true }]` (L13309), which renders "generated OpenAPI reference pages" from a spec you supply (L13354). The worker is Hono (L9131), so adding `@hono/zod-openapi` yourself is possible (inference, not documented).

## 10. Scaffold and CLI

**Command (non-interactive by default):**

- `npm create deepspace@latest my-app` (L1078). "The scaffolder is non-interactive by default and prints a list of files it created. Pass `--interactive` if you want a prompt-driven wizard." (L1082)
- Into the current directory: `npm create deepspace@latest .` (must be near-empty) (L1314-1316, L1326).
- Help: `npm create deepspace@latest -- --help` (L1319).
- "there is no `--yes` flag - passing one is refused with an explanation" (L1324).
- `--no-register` "is still accepted ... but it does nothing" (L1322).
- With the CLI available: `npx deepspace app create my-app [--template starter|copilot] [--interactive] [--local <path>]`, which "Runs `create-deepspace`; all flags are forwarded" (L23044-23058).
- Templates: `starter` (default) or `copilot` (L23055). A staging-only `--template public-board` exists (L188).
- No separate directory flag is documented; the name positional is the directory. **There is no `npx deepspace create` command** (the command map, L22982-22992, has `app create`).
- Version pinning: "`create-deepspace@X` pins `deepspace` to **exactly** `X`" (L1290). npm 11.6+ recommended (`SKILL.md:108-113`). Node `>=22.15.0 <23 || >=24 <25 || >=26 <27` (L1266).

**Login: not needed to scaffold.** "You'll have a working app at the end, but `npx deepspace dev start` won't start until you've logged in." (L1286). "A scaffold made while signed out is fine" (`SKILL.md:128-129`).

**Registration, name lease, source latch: the scaffold does none of these.**

- "The scaffolder does **not** register the app or make a commit. `wrangler.toml` keeps the `__APP_ID__` placeholder until the app's first use registers it" (L1288).
- Registration happens on the first id-needing command, "`app init`, `dev start`, `test run`, `deploy`, or a secrets write" (L1294). Run `auth whoami` first.
- "`app init` and `deploy` also make the repository's initial commit when it has none. Register before you commit anything yourself" (L1306).
- The name lease is taken at deploy: "A name someone else holds is refused at deploy time" (L1086). The name "is only a **lease** on `<name>.app.space`" (L15619). It is "reserved for you for 30 days" after a rename (L15662).
- The scaffold "Initializes a git repository" (L1284) with no commit and no remote, so it does not latch source (Q11).

**Tooling shipped** (L1401-1417, L1521-1531):

- `vitest.config.ts` ("Vitest config for the `unit` suite")
- `eslint.config.js` ("Flat ESLint config")
- `tsconfig.json` ("Strict mode, covers `src/` and `worker.ts`")
- Playwright `tests/` (`smoke.spec.ts`, `api.spec.ts`, `collab.spec.ts`, helpers, `playwright.config.ts`)
- `AGENTS.md`, `CLAUDE.md`, and the bundled skill under `.agents/`

Details from the example apps (template-derived):

- ESLint is "intentionally minimal. One rule is enabled: react-hooks/rules-of-hooks ... runs automatically via vite-plugin-checker ... fails the build during `deepspace deploy`" (`tally: eslint.config.js`).
- Scripts include `type-check: tsc --noEmit`, `lint: eslint .`, `test:unit: vitest run --passWithNoTests` (`tally: package.json`).
- **No formatter** (no Prettier or Biome; grep finds none).

**`npx deepspace add`:**

- "Install a scaffold feature into the current app." Flags: `--list`, `--info <name>`, `--install`. "Run `--list` for the current feature set - it changes between releases." (L23674-23693)
- Features named in the docs: `admin-page` (L3051), `ai-chat` (L5237), `cron` (L13919), `documentation` (L13236), `landing` (L16452), `messaging` (L23681), `mobile` (L5053). `docs` and `kanban` are mentioned in passing (L15144).

## 11. Source control

**What "latches permanently on first source use" means.**

- "A new app starts unclaimed. Its first source-producing action latches one source permanently: a deploy from a checkout with a GitHub remote claims that GitHub repository; a first `deepspace push`, or a deploy without a GitHub remote, claims DeepSpace source. There is no setter, unclaim, or transfer." (L15891)
- When it fires: for push, "at the git pack POST ... never at the ref advertisement"; for deploy, "after request validation when the durable release reservation is accepted ... The claim is not undone if a later deploy phase fails" (L15918).
- "This includes `deploy --no-push`" (L15914).
- The only way out is a new app: "To use a different source for the same code, register a new app (`deepspace app init --new-id`)" (L15918). That means new data and secrets.

**For code on GitHub, choose GitHub source.**

- "Manual Git ownership. ... Deploy ships the **local working tree** and performs no Git read, write, or credential verification." (L15905)
- "dirty and unpushed bytes are **valid deploy inputs**" (L15907).
- Workspaces, `clone`, `push` and `pull` are DeepSpace-source only (L15978).

**Safe sequence** (inference from the docs):

1. `auth whoami`
2. `npx deepspace app init` (registers; may make the initial commit, L1306)
3. `git remote add origin git@github.com:<org>/<repo>.git && git push -u origin main` (L15936-15938)
4. Check `npx deepspace status --json`: "`sourceInference`: what the NEXT deploy will do" (L15897)
5. `npx deepspace deploy`

**Commands to avoid before the first GitHub deploy:**

- `npx deepspace push`: "**Do not run `deepspace push` before the first GitHub deploy** — that would claim DeepSpace source permanently." (L15933). Also `SKILL.md:35-36`.
- `npx deepspace deploy` (including `--no-push`) from a checkout without the GitHub remote selected (L15914).
- In CI: "A CI checkout's selected remote decides an unclaimed app's first deploy: keep the intended GitHub remote" (L15957).
- `git push --mirror`: "**Never `git push --mirror`.**" (L15941).

After the claim, "every DeepSpace source verb refuses ... with `source_managed_by_github`" (L15933). "Selected remote" is not defined further in the docs.

## 12. Testing

**`npx deepspace test run`** "bootstraps Playwright (downloads Chromium on first run), regenerates dev secrets, and runs the suite against the dev workers. Tests use **real services**" (L15132).

- Suites: "`smoke`, `api`, `e2e`, `unit`, `all`, or a path ending in `.spec.ts`". The default is smoke + api. Flags: `--port`, `--grep`, `--project`, `--headed`, `--env` (L23314-23323).
- "The default suite (`smoke + api`) does not include `e2e`" (L23323). The `--json` envelope lists `skippedSpecs` (L23335).
- "`test run` requires a logged-in user - it mints an app-owner JWT into the regenerated `.dev.vars`" (L23327). The first `test run` also registers the app (L1294).
- Tests hit the same local DO as dev, so prefix test records `__test-${Date.now()}__` and clean up (L15255-15263).

**Multi-user fixture.**

- `import { test, expect } from 'deepspace/testing'`, then `const [alice, bob] = await users(2)`. Each user is `{ context, page, email, name, userId? }` (L15177-15189). Selectors: `users(['Alice','Bob'])` or `users(1, { label })` (L22584-22593).
- Accounts come from `~/.deepspace/test-accounts.json`, created with `npx deepspace test accounts create --email x@deepspace.test --password ... --name ...`. "max 10 total per machine". Emails must end `@deepspace.test` (L15201-15217). Test accounts cannot deploy (L15231).

**Plain Vitest alongside: YES.**

- `npx deepspace test run unit` (L15160-15161, L23307). `vitest.config.ts` is "Vitest config for the `unit` suite" (L1407).
- Docs example unit test: `expect(lintSchema(notesSchema)).toEqual([])` (L20864-20869).
- Example apps run `src/**/*.test.ts` in a node environment, kept separate from `vite.config.ts` "because the app config carries the Cloudflare + dep-prebundle plugins that vitest cannot drive" (`tally: vitest.config.ts`).
- Whether `test run all` includes `unit`: not stated explicitly (L23316 lists it as a separate suite name).

## 13. Email (`email/send`)

**Cost per message: not documented.**

- "Each email is charged to their DeepSpace credits (100 credits equal US$1). The docs do not list a per-email price" (L7387).
- To get the exact price: `npx deepspace integrations info email/send` prints "its billing (cost and unit)" (L14435). It needs no login (L14428).

**Cron can send: YES.**

- Documented in the cron guide: `await ctx.integrations.call('email/send', { from: 'My App <my-app@app.space>', to: user.data.email, subject, text })` (L13717-13722, L21774-21779). "Calls are billed to the app owner's credits." (L7288).
- Required fields: "requires `from`, `to`, `subject`, and an `html` or `text` body; `cc`, `bcc`, `reply_to`, and `headers` are optional" (L14530).
- Sender must be `<app-name>@app.space`: "`alerts@my-app.app.space` is rejected as an unverified domain" (L14532-14535).
- Failure when credits are exhausted: `insufficient_credits` (L7378).
- Your own domain requires your own Resend account plus a `RESEND_API_KEY` secret (L14549).
