# 0010. Score inside the submit action, not in a background job

**Status:** Accepted, 2026-11-19. Confirmed by spike S2 on the deployed app
([result](#spike-s2-2026-11-19)).

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

## Spike S2, 2026-11-19

An action read a 50,000-row answer key from a record, parsed a 50,000-row predictions file
and scored both halves with two metrics ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)):

- The largest case, a 2.3 MB file with every field quoted: 53 to 67 ms per request on the
  local dev server, against 10 to 23 ms for an action that does nothing.
- CPU, measured in Node where the clock is not frozen: 35 to 46 ms for parsing the request
  body, parsing the key, parsing the CSV and scoring. The estimate of tens of milliseconds
  holds.

Not confirmed: the CPU limit of the deployed Worker. Local `workerd` enforces none. Run
the same request on the deployed app and read `npx deepspace logs` for `exceededCpu`; the
job fallback stays until then.

### On the deployed app

24 of 24 requests scored a 50,000-row file on holdout.app.space, the 2.3 MB all-quoted one
included ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)). A request took 270 to 550 ms, which includes uploading 1 to 2.6 MB
from a home connection; an action that does nothing took 82 ms. The logs show the outcome
`ok` for these requests and no `exceededCpu`. The job fallback is not needed.

The logs do not report CPU time, so how far below the limit this is remains unknown. The
spec's sizes are the tested ones; raising them means running this spike again.
