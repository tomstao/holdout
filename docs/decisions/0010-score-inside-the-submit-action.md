# 0010. Score inside the submit action, not in a background job

**Status:** Accepted, 2026-11-19. Spike S2 passed locally; the CPU limit is still to confirm
on the deployed app ([result](#spike-s2-2026-11-19)).

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
