# 0016. The Worker serves only what the app uses

**Status:** Accepted, 2026-11-19. Departs from the scaffold
([ADR 0001](0001-build-on-the-deepspace-scaffold.md)).

## Context

The scaffold wires every DeepSpace surface into the Worker, so that any feature works the
moment it is used. Holdout uses a few of them. An independent review of the built app
([plan.md](../plan.md), day 5) found that several of the others were ways around the
app's own rules. Each was checked against the SDK's built code before anything changed.

| Scaffold default                                                      | What it allowed here                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/ws/cron/:roomId`, with a signed-in user's app role                  | A member's socket may pause a task (`canWrite` for `member`). Anyone could stop competitions from closing, for good     |
| Every `/ws/...` route accepts any room name                           | A request for an unused name creates that room. For a cron room: one more copy of the close task, every minute, forever |
| `registerAgent`: record tools over HTTP for a signed-in user          | A count of the rows matching any filter on a closed collection, through a distinct error at the scan cap                |
| `/api/integrations/:name/:endpoint`: an unlisted name bills the owner | Any signed-in user could call any paid integration, or send mail from the app, on the owner's account                   |
| `/api/files/*` forwards every method                                  | Any member could upload until the app's file allocation was full                                                        |
| The record room's built-in `canvas-settings` collection, open to all  | A signed-out socket could write rows of any size into the room that holds the competitions                              |

None of these had been used against the live app: its room was empty.

## Decision

Remove or close each surface the app does not use.

1. **Sockets** (`src/server/realtime-routes.ts`, now our code): one route, the record room
   named `app:<this app's id>`, and only for a WebSocket upgrade. Every other path under
   `/ws` answers 404. The cron and job rooms are reached from Worker code only.
2. **Agent tools**: `registerAgent` is not called, `src/ai/` is deleted, and the layout no
   longer mounts `<AgentTools />`. The app has no assistant
   ([ADR 0012](0012-integrations-email-only.md)).
3. **Integrations**: `src/integrations.ts` lists nothing, and the proxy answers 404 for a
   name that is not listed instead of billing the owner. The close-out email, when it is
   built, is sent by the job from Worker code.
4. **Files proxy**: GET, HEAD and DELETE only. Files are written by `createCompetition`.
5. **Built-in collections**: `AppRecordRoom` refuses any frame that names one
   (`src/server/room-guard.ts`), before the SDK reads it.

The Yjs, canvas and presence Durable Object classes stay exported and bound. Removing a
class is a migration, and an unreachable class costs nothing.

## Consequences

- `src/server/surface.test.ts` runs the real route registrations and fails if a request is
  forwarded where it should not be; four of its seven tests fail against the scaffold's
  routes. `tests/surface.spec.ts` checks the same against the running Worker and room.
- There is no cron or job monitor in the browser. `npx deepspace logs` shows each run.
- A local assistant cannot be bridged to this app with the CLI.
- `http-routes.ts` is still scaffold code with two edits. After `npx deepspace app update`,
  re-check both, and that the update did not restore the removed routes.
- The `ai` package stays a dependency: the SDK's Worker bundle imports it.
- The open `canvas-settings` collection is a platform default and is worth reporting
  upstream (`npx deepspace feedback`); so is the member's right to pause a cron task.

## Alternatives

- **Keep the cron socket, give `admin` to the owner only.** Works, but nothing in the app
  reads it, and the any-room-name problem remains for every other route.
- **Keep the agent tools and refuse the two closed collections in the executor.** Leaves a
  surface whose every tool has to be re-examined when the SDK changes.
- **Leave the scaffold alone and rely on the platform's defaults.** They are reasonable
  defaults for an app that uses those features. This one does not, and three of them
  defeat guarantees the spec makes.
