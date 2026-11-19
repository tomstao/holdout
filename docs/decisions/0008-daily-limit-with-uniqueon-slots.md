# 0008. Enforce the daily limit by claiming numbered slots with `uniqueOn`

**Status:** Accepted, 2026-11-19. Confirmed by spike S4, locally and on the deployed app
([result](#spike-s4-2026-11-19)).

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

## Spike S4, 2026-11-19

Five creates with the same composite key fired together from one request, and twenty
races between two requests: exactly one create succeeded every time ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)).

- The refusal carries no `code`. It is `success: false` with an `error` that begins
  `Duplicate: a record with`. `submitPredictions` detects it by that prefix, in one
  helper with a unit test, so an SDK change to the wording fails a test and not a
  submission.
- An update that would move a row onto a taken key is refused the same way.
- `tools.create` with an existing `recordId` merges instead of refusing, so the claim
  must use a generated id and rely on `uniqueOn` alone.

The check and the insert are synchronous SQL inside the Durable Object (SDK code, the
same once deployed), so this result does not depend on a platform limit.

The deployed app gave the same result: one winner in 20 of 20 races.

## Built, 2026-11-19

`submitPredictions` (`src/actions/submit-predictions.ts`) claims the slot as decided above.
The refusal is recognised by `isUniqueConflict` in `src/actions/shared.ts`, the one place
that knows the room's `Duplicate:` wording. Against the real room, two submissions sent at
the same moment to a competition with a limit of 1 give one score and one
`limit_reached` (`tests/submit.spec.ts`); the unit tests cover the retry onto the next slot
and the `conflict` after a second collision.
