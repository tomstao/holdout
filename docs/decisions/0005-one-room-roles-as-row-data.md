# 0005. One record room; "host" is row data, not a role

**Status:** Accepted, 2026-11-19

## Context

A person can host one competition and enter another. DeepSpace roles (`viewer`, `member`,
`admin`) are stored per record room on the `users` row, and the scaffold's cron and job
rooms resolve roles from the app room only. Per-competition roles are not a documented
feature; a room per competition would need changes to the action tools factory, the cron
and client room naming
([research](../research/deepspace-platform.md#2-scopes-and-rooms)).

## Decision

- One room, `app:<APP_ID>`, holds every collection. Each row carries `competitionId`.
- Everyone signed in is a `member`. The host of a competition is its `hostId`, written by
  the create action from the verified caller and `immutable`.
- Host-only operations are server actions that compare `hostId` with `ctx.userId`.
- The app owner keeps the scaffold's `admin` role but gets no extra reach into
  competitions: closed collections are closed to `admin` too.

## Consequences

- Queries filter by `competitionId` (exact-match `where` is all the SDK offers).
- A competition's subscriptions share one Durable Object with all others. That is fine for
  classroom sizes ([spec limits](../spec.md#limits-and-numbers)); a room per competition is
  the scaling step.

## Alternatives considered

- **Room per competition** (`comp:<id>`) with the host as the room's `ownerUserId`, as the
  mobile `accountStores` pattern does: isolates load and gives a real per-room admin, but
  it is undocumented for this use and changes three scaffold-owned pieces.
- **Custom roles** via `setRole`: app-wide, so they cannot express "host of this one".
