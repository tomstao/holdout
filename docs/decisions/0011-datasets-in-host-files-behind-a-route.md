# 0011. Datasets in the host's private file folder, served by a Worker route

**Status:** Accepted, 2026-11-19. Fallback to decide in spike S3 ([plan](../plan.md)).

## Context

`train.csv`, `test.csv` and the generated `sample_submission.csv` are public: everyone,
signed in or not, may download them. DeepSpace app files have two scopes
([research](../research/deepspace-platform.md#4-file-uploads-user2files)): `app` is
world-readable, and the docs do not say whether another member can overwrite an `app` key
they did not upload; `self` is private to one user and readable by the Worker. Files are
capped at 1 GiB each and 128 MiB for the whole app on the free plan.

## Decision

- `createCompetition` receives the CSV texts, validates them, and the Worker writes the
  three files to **the host's `self` folder** with `appFiles(env, { scope: 'self', userId:
hostId })`. Only the host and the Worker can write there.
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
