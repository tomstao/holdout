# Submission notes

Draft of the note for the DeepSpace portal, filled in as the build goes. The portal asks
for: what was built, the DeepSpace integrations used, the main trade-off, what the agent
did, and what the applicant verified.

- **Live URL:** <https://holdout.app.space>
- **Demo competition:**
  <https://holdout.app.space/c/ff94aae4-8438-4ed6-a3c4-37bbd7850ca2> (Palmer Penguins,
  practice: the labels are public; open until 2027-02-17)
- **Repository:** <https://github.com/tomstao/holdout>

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
| `email/send` (the one integration) | The close-out email, to the host alone: the top three and a link          |

Left out on purpose, and why: [ADR 0012](decisions/0012-integrations-email-only.md).

## The main trade-off

_A draft from the build's records; put it in your own words._

The live leaderboard is not stored anywhere. Each browser works it out from the public
submission rows, which are only ever inserted.

- **Why:** DeepSpace records have no atomic read-modify-write. A stored "best score per
  participant" row would be a race between two submissions arriving together. Rows that
  are never updated cannot lose that race, and the daily limit uses `uniqueOn` for the
  one place where two writes must not both win.
- **What it costs:** every viewer downloads all of a competition's submissions, about 390
  bytes each, so 5,000 of them are 2 MB in one frame. That caps a competition at
  classroom size (designed for 200 participants). And a public row is public in full:
  the name of each uploaded file is readable by anyone who asks the room.
- **What I would do at ten times the size:** a per-participant best row written by a job,
  which serialises its writes.

The record: [ADR 0007](decisions/0007-derive-the-leaderboard-from-submissions.md).

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
  - Asked a fresh agent, given the spec's guarantees and the code but none of the build's
    reasoning, to review the actions, the access rules and the close. It reported twelve
    findings. Each was checked against the code before anything changed: ten were fixed
    and two were accepted and recorded ([plan.md](plan.md) has the table). Five of the
    ten were routes of the scaffold that the app never used and that were live for a few
    hours: a cron socket where any member could pause the close, tool routes for an
    assistant the app does not have, an integrations proxy billed to the owner, a file
    proxy that took uploads, and a built-in collection open to signed-out sockets
    ([ADR 0016](decisions/0016-serve-only-what-the-app-uses.md)).
- **2026-11-20, the last day (Claude Code):**
  - Created the demo competition on the live site in my browser, with my values and my
    go-ahead for the one click that cannot be undone, then checked its page signed out.
    Pointed the landing's first button at it and, after my deploy, ran the smoke tests
    against the live site.
  - Walked the spec's acceptance criteria on the live site, once I said to: one test
    competition created through the form, three test accounts, a signed-out browser.
    Create, submit, the live board, the daily limit and the closed collections passed;
    an hour later the competition closed on its own, 30 seconds after its deadline, and
    every viewer got the final standings ([plan.md](plan.md) has the table). It
    rehearsed the run against a local server first, because each run leaves a
    competition on the live site for good.
  - Built the close-out email after one test send to two inboxes of mine. It first built
    what the plan said, the host in `to` and the participants in `bcc`. I asked whether
    the host's address should be hidden; it then said its own recommendation had been
    wrong, that every participant would have been shown the host's address, and laid
    out three options. I chose the host alone, and it was changed before any deploy
    ([ADR 0017](decisions/0017-close-email-to-the-host-alone.md)). After my deploy it
    created a one-hour test competition under my account; the live job sent the email
    when it closed.
  - Left 435 unit tests and 41 Playwright tests (against the real room and file storage)
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
  - Gave the go-ahead for each thing that cannot be undone on the live site: creating
    the demo, and the walk-through's test competitions, titled as tests.
  - Asked "should we hide the email?" when the close-out email was built with the host's
    address visible to participants, and chose the host alone.

## What I verified myself

_Fill in with what you checked by hand, not what the agent reported. Suggested:_

- [ ] Read the spec and decisions; changed or confirmed each Proposed item
- [ ] Ran `npm run check` locally
- [ ] On the deployed app: created a competition, submitted from a second account, watched
      a third window update, let a short competition close
- [ ] Tried to read `answer_keys` as a participant
- [ ] Reviewed the actions' authorisation checks line by line
- [ ] Saw the test email arrive in both of my inboxes, and the close-out email from the
      live site in my account's
- [ ] Looked at the closed test competition's final standings and shake-up on the live
      site

## Unfinished, and what I would do next

From [plan.md](plan.md):

- **The close-out email has been sent from the live site once.** A test competition I
  hosted closed and the job's log and my usage show the send. Whether it reached my
  inbox is in "What I verified myself" above. It has never gone to a host other than me.
- **The name of each uploaded file is in the public submission row.** The page shows it
  only to its owner; hiding it from the wire needs a collection only the owner reads
  ([ADR 0007](decisions/0007-derive-the-leaderboard-from-submissions.md)).
- **Nothing limits how often an action may be called.** A refused call is cheap now, but
  there is no rate limit per user.
- **Participants are not emailed at the close.** Any message to them would show them the
  host's address, so only the host gets one. Next: a setting for the host, "show my
  address to participants", or one message per person with a cap on spend
  ([ADR 0017](decisions/0017-close-email-to-the-host-alone.md)).
- **Editing a competition was not walked on the live site,** and neither were the write
  probes against the closed collections. Both pass against the real room locally.
- **Two test competitions stay listed on the live site beside the demo.** Nothing
  deletes a competition in v1.
- **Reference screenshots** for the design were never taken; the screens were checked
  against the design direction and DeepSpace's checklists instead.
- Out of scope for v1 by decision, each with what would come next: choosing final
  submissions by hand, teams, log loss and ROC AUC, private competitions, code
  submissions, deleting a competition ([spec.md](spec.md), "Out of scope for v1").
