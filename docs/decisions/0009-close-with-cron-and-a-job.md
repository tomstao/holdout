# 0009. Close competitions with a cron task that enqueues a job

**Status:** Accepted, 2026-11-19. Write budget and job permissions to confirm in spikes
S5 and S7 ([plan](../plan.md)).

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
