# 0006. The answer key lives in a closed collection

**Status:** Accepted, 2026-11-19. Size limit to confirm in spike S1 ([plan](../plan.md)).

## Context

The answer key (test IDs, true targets, and which rows are public) is the one secret in
the app. No browser may read it, including the host's after upload and the app owner's.
The server must read it on every submission.

Options DeepSpace offers
([research](../research/deepspace-platform.md#1-collections-and-rbac)):

- A collection whose permissions are all `false` for every role, `admin` included. The
  record room never sends its rows to a client; server actions, cron and jobs read it
  because their tools bypass RBAC.
- The host's private (`self`) file folder: readable by that user and the Worker only.
  But the host could read it back, and uploads fail locally until the first deploy.
- A custom R2 bucket binding only the Worker can reach.

## Decision

Parse the solution file at creation and store it as one record in `answer_keys`: `rows`
is a JSON array of `[id, target, split]`, and the record id equals the competition id.
Every role is closed. The host's upload is validated, normalised and never stored as a
file.

## Consequences

- The secret is protected by plain DeepSpace RBAC, the clearest thing to demonstrate and
  test: a Playwright spec asserts that a participant's `useQuery('answer_keys')` and the
  agent tools' `records.query` return nothing.
- Durable Object rows are limited to 2 MB, so the key is capped at 1.5 MB of JSON and
  50,000 rows. Spike S1 writes and reads a 1.5 MB record on the deployed app; the fallback
  is chunking the key over several records (`competitionId:0`, `:1`, …).
- Scoring is one `tools.get` plus parsing, no file download.

## Alternatives considered

- **Host's `self` file:** private from participants, but the host can download it, local
  development needs a deploy first, and every submission downloads and parses a file.
- **Custom R2 bucket:** strongest isolation, but a custom binding and more code for no
  extra protection at this size.
