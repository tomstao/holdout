# 0009. Close competitions with a cron task that enqueues a job

**Status:** Accepted, 2026-11-19. Confirmed by spikes S5 and S7 on the deployed app
([result](#spikes-s5-and-s7-2026-11-19)).

## Context

At the deadline a competition must close without anyone visiting: compute final
standings, write one row per participant, mark it closed and send one email. DeepSpace
cron has 1-minute granularity and no per-record schedule, `where` has no range filter, and
each record write is a subrequest to the room, with limits that are not documented for
this platform. Members can trigger cron tasks and enqueue jobs by default.

## Decision

- **The deadline is enforced at submit time.** `submitPredictions` refuses when
  `now >= deadline`. The close only produces results, so a late close never lets a late
  submission in.
- **Cron task `close-due-competitions`** (every minute) lists competitions with status
  `open`, keeps those whose deadline has passed (filtered in code), marks each `closing`,
  and enqueues a `close-competition` job. It also re-enqueues competitions stuck in
  `closing` for more than 10 minutes.
- **Job `close-competition`** reads the submissions and private scores (paged), computes
  standings with `src/domain/ranking.ts`, upserts `final_standings` in chunks with
  `ctx.continue()` between chunks, sets `closed`, then sends the email.
- **Every step is idempotent:** deterministic standings ids, the job stops on a closed
  competition, and only the run that sets `closed` sends the email. An early trigger by a
  member does nothing, because both the task and the job re-check the deadline.
- The job's payload (`{ competitionId }`) and result (counts) carry nothing private,
  because members can read job rows by default.

## Consequences

- Results appear about one to two minutes after the deadline; the page says so meanwhile.
- The close is observable: the job's progress and failures show in `useJobs` and the logs.

## Alternatives considered

- **Close inside the cron task:** simplest, but one task writing every standings row
  risks the subrequest ceiling for a larger class, and a failure half-way has no retry or
  progress.
- **Close lazily on the first visit after the deadline:** no email, and it puts the
  write load on a visitor's request.

## Spikes S5 and S7, 2026-11-19

S7, confirmed. With `authorizeWrite: () => false` on the JobRoom, `enqueueJob` from the
cron task and from an action still ran the job, and a signed-in member's
`useJobs().enqueue` was rejected with `JobRoom write access denied` ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)). So the
close (PR 11) closes the queue to every client:

- `authorizeWrite` refuses everyone. A member can then no longer enqueue, cancel or retry
  a `close-competition` job; the deadline re-check in the job stays as a second defence.
- `authorizeRead` is set on its own (it defaults to `authorizeWrite`, which would hide
  the queue from every client). Members may read; payloads and results stay free of
  private data.
- Members can still trigger the cron task by default. That was not part of S7 and the
  task's own deadline check covers it.

S5, passed locally. A job wrote 200 records in one run (0.9 s), in five chunks of 40 with
`ctx.continue` (1.0 s in total, about 50 ms between chunks) and 1,200 in one run. The
cron task wrote 200 in 0.9 s. Local `workerd` enforces no subrequest limit, so the
ceiling has to be seen on the deployed app. The design keeps chunks of 40, which cost
about 50 ms each.

### On the deployed app

Both spikes ran again on holdout.app.space ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)).

- **No write limit was hit in a job or in the cron task.** A job run wrote 200 records
  and 1,200 records; the cron task wrote 1,100. The limit of 1,000 subrequests that stops
  a Worker request did not apply to these Durable Object alarms.
- **A write takes about 28 ms there,** six times the local figure. One at a time, 200
  standings take 5.6 s; with 20 in flight they take 0.45 s. The close job writes each
  chunk with `Promise.all`.
- **Chunks cost nothing measurable.** Five chunks of 40 with `ctx.continue` took the same
  5.7 s as one run of 200. The design keeps them, for progress and a restart point.
- S7 gave the same result as locally.

## Built, 2026-11-19

`src/server/close.ts` holds both halves as plain functions; `src/cron.ts` and
`src/jobs.ts` wire them to the rooms. What the code adds to the decision above:

- **A grace period.** The job waits until ten seconds after the deadline
  (`ctx.continue` with `afterMs`) before it reads the submissions, so one that passed
  the deadline check in the last instant has written both its rows.
- **Chunks of 40, 20 writes in flight.** At about 28 ms a write, a chunk takes about
  60 ms on the deployed app.
- **Three attempts.** The cron task enqueues with `maxAttempts: 3`; a competition still
  `closing` after ten minutes is enqueued again.
- **The queue is closed to clients.** `authorizeWrite` refuses everyone and
  `authorizeRead` is set on its own for members.
- **A submission without its private score is left out** of the standings instead of
  failing the close.

Not built: the email. It waits for spike S8.

Checked by 15 unit tests of the two functions and by `tests/close.spec.ts`, where a
competition due in 45 seconds is closed by a real cron tick and job in about 70 seconds.

## Addendum, 2026-11-19: a deadline that moves at the last moment

The host can move a deadline later (spec F5). The room has no "check and write" in one
step, so this order is possible, within a few milliseconds of the deadline:

1. `updateCompetition` reads the competition: open, deadline not yet passed.
2. The cron task finds it due and marks it `closing`.
3. `updateCompetition` writes the later deadline.

The job then finds a `closing` competition that is not due. It sets it back to `open`
and stops (`reason: 'reopened'`). Without that, the competition would have stayed
`closing`, refusing submissions, until the new deadline. Covered by a unit test of the
job; the order itself was not reproduced against the real rooms.

## Addendum, 2026-11-19: attempts are steps

"Three attempts", above, was wrong for a close of any size. The job room adds one to a
job's attempts each time it runs it, a step that ends in `continue` included, and retries
a failure only while the count is below `maxAttempts`. With three, a failure in the third
step or later ended the job, and the competition stayed `closing` until the ten-minute
sweep enqueued a new one. The job is now enqueued with `CLOSE_MAX_ATTEMPTS` (12): six
steps for 200 participants and six for failures. A larger close still finishes; past the
twelfth step it relies on the sweep after a failure.

Since [ADR 0016](0016-serve-only-what-the-app-uses.md) no client can reach the cron or
the job room, so "members can trigger the task" no longer applies. The task and the job
still check the deadline themselves.
