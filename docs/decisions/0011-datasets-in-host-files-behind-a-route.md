# 0011. Datasets in the host's private file folder, served by a Worker route

**Status:** Accepted, 2026-11-19. Confirmed by spike S3; the `app`-scope alternative is
rejected ([result](#spike-s3-2026-11-19)).

## Context

`train.csv`, `test.csv` and the generated `sample_submission.csv` are public: everyone,
signed in or not, may download them. DeepSpace app files have two scopes
([research](../research/deepspace-platform.md#4-file-uploads-user2files)): `app` is
world-readable, and the docs do not say whether another member can overwrite an `app` key
they did not upload; `self` is private to one user and readable by the Worker. Files are
capped at 1 GiB each and 128 MiB for the whole app on the free plan.

## Decision

- `createCompetition` receives the CSV texts and validates them. The Worker then writes
  the three files to **the host's `self` folder**, through `appFiles` with
  `scope: 'self'` and the host's verified user id. Only the host and the Worker can
  write there.
- A public route, `GET /api/competitions/:id/files/:kind`, looks up the key on the
  competition and streams the file with `appFiles(...).download(key)`, with
  `Content-Disposition` and cache headers.

## Consequences

- No client ever writes a dataset file, so no participant can replace one.
- One custom route (about 30 lines) instead of using the `useR2Files` hook directly.
- Uploads need the app deployed once (`APP_IDENTITY_TOKEN`); locally they return 401
  before that. Creating competitions locally works only after the first deploy.

## Alternatives considered

- **`app` scope files read through `getUrl()`:** less code. If spike S3 shows that a
  second member cannot overwrite or delete another's `app` key, switch to this and drop
  the route.
- **Files as records:** a 5 MB `train.csv` does not fit a 2 MB row.

## Spike S3, 2026-11-19

Two test accounts and the real platform file storage ([lessons](../lessons.md#2026-11-19-day-1-spikes-s1-to-s8)):

- **`app` scope is not safe for datasets.** Member B uploaded to the key member A had
  used and the public URL then served B's bytes; B then deleted the file. The alternative
  below is rejected.
- **The route design works.** The Worker wrote a 5 MB file into the host's `self` folder
  with `appFiles` (1.7 to 2.0 s). Another member's read was refused, a signed-out read
  answered 401, and a public Worker route streamed the file back intact in 0.3 s with
  `Content-Length`, `Content-Disposition` and cache headers.
- `download` and `delete` take the stored key that `upload` returns, so the competition
  record stores that key, not the one passed to `upload`.
- The host can replace or delete a file in their own folder with `useR2Files`. That is
  the host changing their own competition's data; the route answers 404 if it is gone.
