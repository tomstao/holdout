# 0004. Zod contracts as the API's source of truth, no OpenAPI document

**Status:** Accepted, 2026-11-19

## Context

DeepSpace leaves the browser-Worker boundary untyped: `useQuery<T>(collection: string)`
takes a hand-written `T`, and server actions receive `params: Record<string, unknown>` and
return `ActionResult<unknown>`. The example apps hand-roll their action clients. The
question was whether to describe the API with an OpenAPI document, and generate types from
it, so that coding agents work against a precise contract.

What the API is here:

- **Reads** do not go over HTTP. They are live record subscriptions over the SDK's
  WebSocket. OpenAPI cannot describe them.
- **Writes** are three server actions, all `POST /api/actions/<name>`.
- **Every consumer** is TypeScript compiled in this repo, from the same commit.
- **Agents already have a machine-readable surface:** the scaffold exposes app tools
  over MCP with JSON Schemas (`npx deepspace agent tools <app> --json`).

## Decision

- One **Zod contract** per action (`defineAction({ description, input, output })`) and per
  collection, in `src/contracts/`. Both runtimes import them; TypeScript infers every type
  from them.
- **Worker:** `implement(contract, handler)` validates input before the handler runs and
  parses output after it, which drops undeclared fields. `src/actions/index.ts` uses
  `satisfies` so a contract without a handler, or a handler without a contract, does not
  compile.
- **Browser:** `callAction(name, input)` and `useCollection(name, query)` infer input,
  output, record and query-key types; the client also checks responses against the
  contract.
- **Drift:** a test fails when a record's Zod contract and its DeepSpace
  `CollectionSchema` disagree.
- **No OpenAPI document** in v1.

## Why this is better for agent-written code

- A mistake shows up as a compile error at the call site, which is the fastest and most
  precise feedback an agent gets. A generated client from an OpenAPI file adds a build
  step that can be skipped or go stale.
- The contract is executable: the same object validates requests at runtime. An OpenAPI
  file next to hand-written validation is two sources of truth.
- It covers the live reads too (`useCollection`), which OpenAPI cannot.

## When to revisit

Add OpenAPI when a consumer outside this TypeScript build appears, for example
submitting predictions from a Python notebook (`holdout submit` like `kaggle competitions
submit`). Then generate the document from the same contracts (Zod 4's `z.toJSONSchema`),
never by hand. For agents, prefer exposing actions as DeepSpace agent tools, which carry
JSON Schemas already.

## Alternatives considered

- **`@hono/zod-openapi` routes with the Hono RPC client:** typed and documented, but it
  replaces DeepSpace server actions with custom routes, so the privileged record tools
  the scaffold wires up for actions (`src/server/action-routes.ts`) would have to be
  re-created for those routes. That is reimplementing a platform primitive.
- **tRPC:** a second RPC layer beside the platform's.
- **Hand-typed `useQuery<T>` and `fetch` calls:** what the examples do; nothing checks them.
