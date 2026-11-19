# 0008. Enforce the daily limit by claiming numbered slots with `uniqueOn`

**Status:** Accepted, 2026-11-19. Conflict behaviour to confirm in spike S4
([plan](../plan.md)).

## Context

Participants get `dailyLimit` scored submissions per UTC day. "Count today's, then
insert" is not atomic in DeepSpace, so two concurrent submissions (two tabs, a double
click) could both pass a count of `limit - 1`. The docs' own per-user quota example has
this race. The one write-side guarantee the record room gives is `uniqueOn`: it refuses a
write that would duplicate a composite key, on every write path.

## Decision

- `submissions` has `uniqueOn: ['competitionId', 'participantId', 'utcDay', 'slot']`.
- The action counts the caller's submissions for today, takes `slot = count + 1`, and
  refuses with `limit_reached` if that exceeds the limit.
- It creates the submission with that slot. If `uniqueOn` refuses it, another request
  took the slot: recount once and retry; a second refusal answers `conflict` ("Another
  submission is being scored. Try again in a moment.").
- Validation and scoring happen before the slot is claimed, so a file that fails
  validation never uses a slot (as on Kaggle, where only scored submissions count).
- The browser disables Submit while a submission is in flight.

## Consequences

- At most `dailyLimit` scored submissions per participant per day, even under concurrency.
- A slot is claimed after scoring, so a participant who submits twice at once does the
  scoring work twice and gets one `conflict`. That is cheap at these file sizes.

## Alternatives considered

- **Accept the race and document it:** simple, and an extra submission is low stakes,
  but the platform has a correct primitive for this.
- **Serialise submissions through the JobRoom:** correct, but slower for every
  submission and members can read job payloads by default.
