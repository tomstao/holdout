# Submission notes

Draft of the note for the DeepSpace portal, filled in as the build goes. The portal asks
for: what was built, the DeepSpace integrations used, the main trade-off, what the agent
did, and what the applicant verified.

**Live URL:** <https://holdout.app.space>
**Repository:** <https://github.com/tomstao/holdout>

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
| `email/send` (the one integration) | One close-out email per competition. **Not built yet** (see the end)      |

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
- **2026-11-19, the build (Claude Code), in small pull requests, each merged when CI was green:**
  - Tested the plan's open questions as spikes against the local and the deployed app
    before building on them, and wrote down what the platform really does where it
    differs from its docs ([lessons.md](lessons.md)).
  - Built the pure core first (CSV, metrics checked against scikit-learn, the split, the
    dataset and prediction rules, ranking), then the three typed actions, the pages, the
    automatic close, the theme, the competition list, the landing page, the demo files
    and editing.
  - Found and fixed three things that tests alone would not have shown:
    - a column marked `immutable` in a closed collection answered differently for a right
      and a wrong guess, before the permission check. It would have let a participant
      confirm a private score by guessing. No closed collection has such a column now,
      and a spec guesses to prove it;
    - the file storage refuses uploads that race for one account's usage counter (503).
      The create action retries; a stress case reproduced it before the fix;
    - the host's edit and the scheduled close can touch a competition in the same
      instant. The close job repairs the one bad outcome.
  - Left 370 unit tests and 38 Playwright tests (against the real room and file storage)
    passing, and the design rules checked in CI.
- **Where I directed or corrected it** (_a draft from the session; edit or delete_):
  - Set the working rules up front: small conventional commits, hooks never skipped, one
    reviewable pull request at a time, deploys only by me, the official DeepSpace docs
    first and any departure recorded as a decision, and "what you verified" kept apart
    from "what you did not".
  - Chose to run the spikes on the deployed app and roll back, and to postpone the email
    check rather than send to addresses I had not picked.
  - Asked for branch protection on `main` once the first pull requests were in.
  - Told it the plan's days were a timeline, not a pace.

## What I verified myself

_Fill in with what you checked by hand, not what the agent reported. Suggested:_

- [ ] Read the spec and decisions; changed or confirmed each Proposed item
- [ ] Ran `npm run check` locally
- [ ] On the deployed app: created a competition, submitted from a second account, watched
      a third window update, let a short competition close
- [ ] Tried to read `answer_keys` as a participant
- [ ] Reviewed the actions' authorisation checks line by line

## Unfinished, and what I would do next

From [plan.md](plan.md):

- **The close-out email.** The job is ready for it; the one platform check left (a send
  with `bcc` and `reply_to`) needs two inboxes of mine, so nothing is wired to real
  recipients yet. The page shows the results either way.
- **The demo competition on the deployed app**, and the landing's "Try the demo
  competition" link, which needs that competition's id.
- **Reference screenshots** for the design were never taken; the screens were checked
  against the design direction and DeepSpace's checklists instead.
- Out of scope for v1 by decision, each with what would come next: choosing final
  submissions by hand, teams, log loss and ROC AUC, private competitions, code
  submissions, deleting a competition ([spec.md](spec.md), "Out of scope for v1").
