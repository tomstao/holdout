# Submission notes

Draft of the note for the DeepSpace portal, filled in as the build goes. The portal asks
for: what was built, the DeepSpace integrations used, the main trade-off, what the agent
did, and what the applicant verified.

**Live URL:** _after the first deploy_
**Repository:** _after the GitHub repository exists_

## What I built

Holdout: small Kaggle-style prediction competitions for a class or study group. A host
uploads data and a hidden answer key; participants upload predictions; the server scores
them; a live public leaderboard updates for everyone; at the deadline the competition
closes on its own and the private leaderboard, scored on held-out rows, shows how far
each person moved. Spec: [spec.md](spec.md).

## DeepSpace features and integrations used

| Feature                            | What it does here                                                         |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Record room and RBAC               | Live public reads; the answer key and private scores closed to every role |
| Server actions                     | Every write: create, submit, edit; validated by typed contracts           |
| `uniqueOn`                         | The daily submission limit, correct under concurrent submissions          |
| Cron room                          | Finds competitions past their deadline every minute                       |
| Job room                           | Closes each one: standings in chunks, idempotent, observable              |
| App files                          | Dataset downloads, written only by the Worker                             |
| Auth                               | Google or GitHub sign-in; signed-out visitors can read                    |
| `email/send` (the one integration) | One close-out email per competition                                       |

Left out on purpose, and why: [ADR 0012](decisions/0012-integrations-email-only.md).

## The main trade-off

_To finish at the end. Candidate: deriving the live leaderboard from insert-only
submission records in the browser instead of storing it. It removes a race DeepSpace
cannot prevent (no atomic read-modify-write) at the cost of each viewer downloading a
competition's submissions, which caps a competition at classroom size
([ADR 0007](decisions/0007-derive-the-leaderboard-from-submissions.md))._

## What the agent did

_Kept up to date per session._

- **2026-11-19, setup (Claude Code):**
  - Researched the domain (Kaggle mechanics, leaderboard probing, metric edge cases,
    licensed datasets) and the platform (13 questions answered from the docs, the
    official skill and example apps), with sources.
  - Checked the docs against the installed SDK and recorded where they differ.
  - Scaffolded the app, installed the official skill, set up the tooling and the typed
    contract layer with tests.
  - Wrote the spec, architecture, decisions, design brief and plan.
- **Where I directed or corrected it:** _fill in (e.g. asked for progressive commits;
  asked for the official skill to guide the work)._

## What I verified myself

_Fill in with what you checked by hand, not what the agent reported. Suggested:_

- [ ] Read the spec and decisions; changed or confirmed each Proposed item
- [ ] Ran `npm run check` locally
- [ ] On the deployed app: created a competition, submitted from a second account, watched
      a third window update, let a short competition close
- [ ] Tried to read `answer_keys` as a participant
- [ ] Reviewed the actions' authorisation checks line by line

## Unfinished, and what I would do next

_Fill in at the end, from [plan.md](plan.md) and the spec's out-of-scope table._
