# 0006. The answer key lives in a closed collection

**Status:** Accepted, 2026-11-19. Confirmed by spike S1 on the deployed app
([result](#spike-s1-2026-11-19)).

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

## Spike S1, 2026-11-19

A record whose `rows` array is 1.5 MB of JSON (47,324 rows) wrote and read back intact on
the local dev server: create 35 to 47 ms, get 20 to 32 ms ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)).

Not confirmed: local `workerd` also accepted an 8 MB record, so it does not enforce the
2 MB row limit this decision depends on. The limit has to be seen on the deployed app.
The chunking fallback stays until then.

To carry into the record contract (PR 5):

- The byte cap binds before the row cap. 50,000 rows of `[id, target, split]` with
  7-character ids are 1.58 to 1.73 MB. Either store `split` as one character (about
  8 bytes less per row) or state the limit in bytes only.
- Count UTF-8 bytes, which is what SQLite limits, not `string.length`.
- `tools.create` returns the stored record, so the action receives the whole key back
  once. `implement()` keeps it out of the response.

### On the deployed app

The same 1.5 MB record wrote and read back intact on holdout.app.space: create 110 to
147 ms, get 41 to 65 ms ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)). The chunking fallback is not needed.

The 2 MB row limit this record was sized for did not show up: records of 2.2, 3 and 8 MB
were stored and read back as well. The 1.5 MB cap stays. Nothing documents a higher
limit, and every submission reads the whole key: an 8 MB key took 0.33 s to read.
