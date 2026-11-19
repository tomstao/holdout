# Holdout

Small Kaggle-style prediction competitions for a class or a study group, built on
[DeepSpace](https://docs.deep.space).

A host uploads a dataset and a hidden answer key. Participants train a model on their own
machine and upload a CSV of predictions. The server scores it and a public leaderboard
updates live for everyone watching. Part of the answer key is held out: at the deadline
the private leaderboard, scored on rows nobody saw a score for, replaces the public one,
and the page shows how far each person moved.

> **Status:** setup is done: research, spec, architecture, decisions, design brief and
> plan are written, and the tooling and the typed contract layer are in place with tests.
> No features yet; the build follows [docs/plan.md](docs/plan.md). The scaffold is
> deployed at <https://holdout.app.space>.

## Quick start

Requires Node 22.15+ or 24 (`.nvmrc`), npm 11.6+, and a GitHub or Google account for
DeepSpace.

```sh
npm install                 # also installs the git hooks
npm run check               # format, lint, types, layers, unit tests
npx deepspace auth login    # once per machine
npx deepspace app init      # once: registers the app, writes its id to wrangler.toml
npx deepspace dev start     # http://localhost:5173
```

Before the first deploy, read the source-control decision
([ADR 0014](docs/decisions/0014-source-control-github.md)): it is permanent.

## How it is built

| Part           | Choice                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Platform       | DeepSpace 0.44.2: Cloudflare Worker (Hono), Durable Object rooms, platform auth and files                                           |
| Frontend       | React 19, Vite 8, file-based routes (generouted), Tailwind 4, the Base UI kit                                                       |
| Data           | One record room; RBAC closes the answer key and private scores to every client                                                      |
| API            | DeepSpace server actions with Zod contracts shared by both runtimes                                                                 |
| Scheduled work | Cron room finds due competitions; job room closes them                                                                              |
| Quality        | strict TypeScript in three projects, type-aware ESLint, Prettier, dependency-cruiser, Vitest + fast-check, Playwright, lefthook, CI |

The reasons are in [docs/decisions/](docs/decisions/README.md).

## Documentation

Start at [docs/README.md](docs/README.md). Coding agents start at [AGENTS.md](AGENTS.md).
