# 0007. Derive the live leaderboard from submissions; keep private scores apart

**Status:** Accepted, 2026-11-19. Confirmed by spike S6 on the deployed app
([result](#spike-s6-2026-11-19)).

## Context

The obvious design keeps one `leaderboard_entries` row per participant with their best
score, updated by the submit action. DeepSpace has no atomic read-modify-write
([research](../research/deepspace-platform.md#3-server-actions)): two submissions from the
same participant can interleave "read best, write best" and leave a stale best. Private
scores must stay hidden until the close, and read permissions are per row, not per field.

## Decision

- **No stored leaderboard while open.** `submissions` is public and holds the public
  score only. The browser subscribes to a competition's submissions and computes the
  leaderboard with `ranking.leaderboard()` from `src/domain`. Same records, same function,
  same result for everyone.
- **Private scores** go to `private_scores`, closed to every role, one row per
  submission.
- **At the close** the job computes final standings with the same domain module and
  writes `final_standings` (public): one row per participant, including the private
  scores of their chosen submissions only.

## Consequences

- No race: the leaderboard is a pure function of rows that are only ever inserted.
- Each viewer downloads a competition's submissions: about 100 bytes per row, so 5,000
  submissions is about 0.5 MB. The spec's limit (200 participants, 5,000 submissions) keeps
  that bounded; spike S6 confirms how many rows one `useQuery` subscription returns.
- Everyone can see each participant's per-attempt public scores and counts, not just
  their best. That gives nobody an edge in probing their own scores; it is a privacy
  trade-off accepted for a classroom tool.

## Alternatives considered

- **Denormalised entries updated by the action:** smaller reads, but racy, and it needs a
  repair pass.
- **Entries recomputed by a job** (the JobRoom runs one handler at a time, so it would
  serialise them): correct, but adds a queue hop to every submission and puts the
  scoring in a place members can read by default.

## Spike S6, 2026-11-19

A signed-out browser subscribed to 4,999 rows shaped like `submissions`. All of them
arrived, in one WebSocket frame, 82 ms after the page mounted; a row created by an action
appeared without a reload ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)).

Corrections to the estimate above:

- A row is about 390 bytes on the wire, not 100: the record envelope and the JSON keys
  outweigh the data. 5,000 submissions are 1.95 MB per viewer, not 0.5 MB.
- That snapshot is one frame. Local `workerd` enforces no message size limit, so a
  1.95 MB frame has to be seen on the deployed app. If it is refused, the fallbacks in
  the plan apply: page in the hook, or keep one best row per participant.
- Subscribe without `limit`. There is no default cap, and a `limit` also stops live rows
  once it is reached: with `limit: 5000` and 5,000 rows shown, later inserts never
  appeared.

### On the deployed app

The 1.95 MB snapshot arrived on holdout.app.space as it did locally: 4,999 rows in one
frame, ready 560 ms after the page mounted, and a row created by an action appeared live
([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)). The paging fallback is not needed at the spec's limit of 5,000 submissions.
