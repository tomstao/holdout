# 0007. Derive the live leaderboard from submissions; keep private scores apart

**Status:** Accepted, 2026-11-19. Query size to confirm in spike S6 ([plan](../plan.md)).

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
