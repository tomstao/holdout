# 0010. Score inside the submit action, not in a background job

**Status:** Accepted, 2026-11-19. CPU budget to confirm in spike S2 ([plan](../plan.md)).

## Context

DeepSpace offers background jobs (`JobRoom`) for work that outlives a request: durable,
retried, with live progress. ThreadHunt runs its scans that way. Scoring a submission
means parsing a CSV of up to 2 MB (about 50,000 rows), checking it against the answer key
and computing two metrics.

## Decision

Validate and score synchronously in `submitPredictions` and answer with the score.

## Consequences

- The participant sees the score in the response, with no queue hop or polling.
- Nothing private passes through a job row (members can read job payloads and results by
  default).
- It depends on the Worker's CPU budget per request, which DeepSpace does not document.
  Estimate: parsing and scoring 50,000 rows is tens of milliseconds. Spike S2 measures the
  largest allowed file on the deployed app. If it does not fit, the fallback is a job with
  `authorizeRead` restricted to the job's creator, which keeps the private score out of
  other members' sight.

## Alternatives considered

- **Always use a job:** worth it for minutes-long work. For milliseconds it adds latency,
  a progress UI and a privacy setting to get right.
