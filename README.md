# Holdout

Small Kaggle-style prediction competitions for a class or a study group, built on
[DeepSpace](https://docs.deep.space).

A host uploads a dataset and a hidden answer key. Participants train a model on their own
machine and upload a CSV of predictions. The server scores it and a public leaderboard
updates live for everyone watching. Part of the answer key is held out: at the deadline
the private leaderboard, scored on rows nobody saw a score for, replaces the public one,
and the page shows how far each person moved.

> **Status, 2026-11-20:** the features of v1 are built, tested and live at
> <https://holdout.app.space>. Try it on the practice competition,
> [Palmer Penguins](https://holdout.app.space/c/ff94aae4-8438-4ed6-a3c4-37bbd7850ca2),
> open until 2027-02-17. Still open: the close-out email and the last walk through the
> acceptance criteria on the live site ([docs/plan.md](docs/plan.md)). The live site
> shows the owner's last deploy, which can be behind `main`.

## What is in it

| Where       | What                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `/`         | The landing page: static, prerendered, with the public/private split explained                 |
| `/home`     | Every competition, live: the ones you host, the ones you entered, open and recently closed     |
| `/host/new` | Create a competition from `train.csv`, `test.csv` and `solution.csv`, checked as you drop them |
| `/c/:id`    | A competition: the live leaderboard, the rules, the data, and Submit (or Edit, for its host)   |

At its deadline a competition closes on its own: a scheduled task finds it, a job scores
each participant's two best public submissions on the private rows, and the page shows
the final standings and how far each person moved.

## Quick start

Requires Node 22.18+ or 24 (`.nvmrc`; the check and the scripts run TypeScript directly),
npm 11.6+, and a GitHub or Google account for DeepSpace.

```sh
npm install                 # also installs the git hooks
npm run check               # format, lint, types, layers, design gate, unit tests
npx deepspace auth login    # once per machine
npx deepspace dev start     # http://localhost:5173
npx deepspace test run all  # Playwright against a local server; needs test accounts
```

The app is registered already (its id is in `wrangler.toml`). The Playwright specs need
three DeepSpace test accounts; [docs/testing.md](docs/testing.md) says how to make them
and what each spec asserts. `node scripts/demo/make-demo.ts` writes the demo competition's
files.

Deploys come from this repository's `main`
([ADR 0014](docs/decisions/0014-source-control-github.md)).

## How it is built

| Part           | Choice                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Platform       | DeepSpace 0.44.2: Cloudflare Worker (Hono), Durable Object rooms, platform auth and files                                           |
| Frontend       | React 19, Vite 8, file-based routes (generouted), Tailwind 4, the Base UI kit                                                       |
| Data           | One record room; RBAC closes the answer key and private scores to every client                                                      |
| API            | DeepSpace server actions with Zod contracts shared by both runtimes                                                                 |
| Scheduled work | Cron room finds due competitions; job room closes them                                                                              |
| Design         | One theme (paper, ink, one orange) held to WCAG AA by a test; IBM Plex served by the app; a gate for DeepSpace's design rules       |
| Quality        | strict TypeScript in three projects, type-aware ESLint, Prettier, dependency-cruiser, Vitest + fast-check, Playwright, lefthook, CI |

The reasons are in [docs/decisions/](docs/decisions/README.md).

## Documentation

Start at [docs/README.md](docs/README.md). Coding agents start at [AGENTS.md](AGENTS.md).
