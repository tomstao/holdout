# Holdout: product spec

Status: v1 spec, 2026-11-19. Decisions it relies on are in [decisions/](decisions/);
the research behind it is in [research/](research/). Anything not written here is out of
scope for v1 ([Out of scope](#out-of-scope-for-v1)).

## The product in one paragraph

Holdout runs small Kaggle-style prediction competitions for a class or a study group. A
host uploads a dataset and a hidden answer key. Participants download the data, train a
model on their own machine and upload a CSV of predictions. The server scores it against
the hidden key and a public leaderboard updates live for everyone watching. Part of the
key is held out: at the deadline the private leaderboard, scored on rows nobody saw a
score for, replaces the public one, and the page shows how far each person moved.

**Why it exists.** Kaggle's own host tooling asks the host for a verified phone number,
hides participants' emails from the host and puts minors through a consent process
([research](research/competition-domain.md#2-kaggle-community-competitions-host-side)).
A teacher or a study group wants the same lesson (a public score is not the final score)
with a sign-in and a link.

**Why DeepSpace.** The core loop needs the platform's hard parts: data no browser may
read (the answer key), writes only the server may make (scores), a view many people watch
change live (the leaderboard), and a deadline that acts on its own (the close).

## Users and roles

| Role        | Who                                          | Can                                                                                      |
| ----------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Visitor     | Not signed in                                | Browse competitions, read pages, download data, see leaderboards                         |
| Participant | Signed in (Google or GitHub)                 | Everything a visitor can, plus submit predictions                                        |
| Host        | The signed-in user who created a competition | Everything a participant can, plus edit their competition's text and extend its deadline |

"Host" is a property of a competition (its `hostId`), not an app-wide role: the same
person can host one competition and enter another
([ADR 0005](decisions/0005-one-room-roles-as-row-data.md)). A host may not submit to
their own competition (they hold the answer key).

## Core loop

1. **Host creates a competition** ([F1](#f1-create-a-competition)).
2. **Participant submits predictions** ([F2](#f2-submit-predictions)) and sees a score.
3. **Everyone watches the public leaderboard** update live ([F3](#f3-live-public-leaderboard)).
4. **At the deadline the competition closes** on its own and the final standings appear
   ([F4](#f4-close-and-final-standings)).

## Features

### F1. Create a competition

**Where:** `/host/new` (sign-in required).

**Input**

| Field                    | Rule                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Title                    | 3 to 80 characters                                                                                                                        |
| Summary                  | 10 to 200 characters, shown in lists                                                                                                      |
| Description              | Up to 5,000 characters of plain text (line breaks kept, no Markdown in v1)                                                                |
| Task type                | `classification` or `regression`                                                                                                          |
| Metric                   | classification: `accuracy` or `macro_f1`; regression: `rmse` or `mae`                                                                     |
| ID column, target column | Names as they appear in the CSV headers                                                                                                   |
| Deadline                 | A future date and time, entered in the host's time zone, stored as UTC; at least 1 hour and at most 90 days ahead                         |
| Daily submission limit   | 1 to 20 per participant per UTC day, default 5                                                                                            |
| Score decimals           | Decimals shown on leaderboards, 2 to 6, default 4 (scores are stored unrounded)                                                           |
| Public share             | 10 to 50% of the answer key, default 30%; only used when the solution has no `Usage` column                                               |
| `train.csv`              | ID column, feature columns and the target column. At most 5 MB                                                                            |
| `test.csv`               | ID column and feature columns, no target. At most 2 MB                                                                                    |
| `solution.csv`           | ID column, target column, optional `Usage` column (`Public`, `Private` or `Ignored`, Kaggle's convention). At most 1.5 MB and 50,000 rows |

**Validation** (the same code runs in the browser for instant feedback and in the
Worker as the authority):

- Every file parses as CSV (RFC 4180; UTF-8 with or without BOM; LF or CRLF). File sizes
  are UTF-8 bytes, and 1 MB is 1,000,000 bytes. What the reader accepts where the RFC
  leaves room is listed at the top of `src/domain/csv.ts`.
- The named ID and target columns exist; `test.csv` has no target column.
- IDs are non-empty and unique within each file; the IDs of `solution.csv` equal the IDs of
  `test.csv` exactly, in any order. IDs, targets and `Usage` values are compared without
  surrounding spaces.
- Regression targets parse as finite numbers. Classification targets are non-empty
  strings; the set of labels is taken from `solution.csv`.
- With a `Usage` column (the name and its values in any letter case): every value is
  `Public`, `Private` or `Ignored`, and Public and Private each have at least one row.
  Without it, the file needs at least two rows, which are split by the public share
  (deterministic, stratified by label for classification; [ADR 0006](decisions/0006-answer-key-in-a-server-only-collection.md)).
- The answer key must also fit in 1.5 MB once prepared for storage, which is a little
  larger than its CSV: with 7-character IDs and short labels that is about 47,000 rows.
- Each problem is reported with its file, row and column, at most 20 per file, with a
  count of the rest.

**Output:** the competition opens immediately. The host lands on its page. The app
generates `sample_submission.csv` (every test ID, with the most common training label or
the training mean as the prediction).

**Source of truth:** the `competitions` record (public) and the `answer_keys` record
(server only). **Edit path:** the host can edit title, summary and description, and move
the deadline later, while the competition is open (F5). Files, task, metric and split are
fixed once created.

**States:** submit button disabled until all three files pass validation; `Button
loading` while creating; on failure, a toast with the server's message and the issues
shown next to the file they belong to.

### F2. Submit predictions

**Where:** the Submit tab of `/c/:id` (sign-in required; hidden for the host).

**Input:** one CSV with exactly two columns, the ID column and the target column (names
as the competition states), one row per test ID, at most 2 MB.

**Rules**

- The competition is open: `now < deadline`, checked by the server at submit time.
- Validation as in F1: every test ID exactly once, no unknown IDs; a classification
  prediction is one of the competition's labels; a regression prediction is a finite
  number. A file that fails validation is not stored and **does not use** a daily
  submission ([ADR 0008](decisions/0008-daily-limit-with-uniqueon-slots.md)).
- At most `dailyLimit` scored submissions per participant per UTC day. The day resets at
  00:00 UTC, as on Kaggle.
- The server scores the file on the Public rows and on the Private rows. It shows the
  participant the public score only.

**Output:** the public score, the submission's number for the day ("2 of 5 today") and
the time until the daily count resets.

**My submissions:** a list under the form: time, file name, public score, best marked.
After the close, the private score of each submission chosen for the final standings
appears next to it.

**States:** drop zone with "Choose a CSV"; local check result ("Ready: 87 rows, 2
columns" or the list of problems) before anything is sent; `Button loading` while
scoring; toast on success; when the daily limit is reached the button is disabled with the
time the count resets; when closed the tab says so and links to the final standings.
Signed-out visitors see the tab with a sign-in button.

### F3. Live public leaderboard

**Where:** the Leaderboard tab of `/c/:id`, the default tab. Public, including signed-out
visitors.

**Rows:** one per participant with at least one scored submission. Rank, display name,
best public score (shown to the competition's decimals), number of submissions, time of
the best submission.

**Ranking:** best public score per participant; higher is better for accuracy and
macro-F1, lower for RMSE and MAE. A tie goes to the participant whose best submission
came first, as on Kaggle. The ranking function is shared by the browser and the Worker
([ADR 0007](decisions/0007-derive-the-leaderboard-from-submissions.md)).

**Live:** a new submission appears for every viewer without a reload, the moved row
highlighted for about a second (no motion with `prefers-reduced-motion`).

**States:** pulse placeholders while loading; empty state "No submissions yet. The first
one sets the bar." with a Submit action for signed-in participants; the viewer's own row
pinned and marked when it is below the fold.

### F4. Close and final standings

**When:** within about two minutes after the deadline, without anyone opening the page
([ADR 0009](decisions/0009-close-with-cron-and-a-job.md)).

**What happens**

1. New submissions are refused from the deadline on (the submit action checks the clock;
   the close does not need to have run).
2. For each participant the app picks their **two best public submissions** (ties: the
   earlier one). Kaggle does this when a team picks nothing; v1 has no manual picking.
3. Their final score is the better **private** score of those two.
4. Final rank by final score (ties: the earlier of the chosen submissions).
5. The competition becomes `closed`; the final standings and the chosen submissions'
   private scores become public.
6. One email goes to the host, with the participants in `bcc`: the top three and a link.

**Final standings view** (Leaderboard tab after close): rank, name, private score,
public rank, and the shake-up (public rank minus private rank: "▲ 3", "▼ 2", "–"). A
toggle shows the public leaderboard as it stood at the deadline.

**States:** while the deadline has passed but the close has not finished, the page says
"Deadline passed. Final standings are being computed." and refreshes on its own when they
arrive.

### F5. Edit a competition (host)

Title, summary and description, and a later deadline (never earlier), while open. Same
validation as F1. Everyone watching sees the change live.

**Where:** the Edit tab of `/c/:id`, which the host has in place of Submit. Moving the
deadline asks for confirmation and names the new time. A deadline moves at most to 90
days from now; leaving it as it is always works, however close it is. Once the deadline
has passed, the tab says the competition can no longer be edited.

### F6. Browse competitions

**Where:** `/home`. Signed in: "Hosting", "Entered", "Open" and "Recently closed"
sections. Signed out: "Open" and "Recently closed" with a sign-in call to action. A
competition is listed once: under "Hosting" if the viewer hosts it, else "Entered" if they
have submitted to it, else by its status. Each row: title, summary, host, participant
count, the top score (public while it runs, final once closed), time to deadline or
"Closed". "Recently closed" holds the latest five.

**Empty states:** "No open competitions. Host the first one." (action: Host a
competition) for signed-in users; the demo competition keeps the list non-empty in
production.

### F7. Landing page

Static page at `/`, prerendered for crawlers: what Holdout is, how the public/private
split works, a call to action to the demo competition and to host one. Designed per
[design/frontend.md](design/frontend.md).

### F8. Demo competition

A real competition, created through F1 by the app owner, on **Palmer Penguins** (CC0;
species classification, 344 rows; [research](research/competition-domain.md#6-demo-dataset-candidates)).
Its labels are public on the internet, so it is labelled as practice and its row IDs are
shuffled and renumbered. Its deadline is kept in the future during review.

The three files come from `node scripts/demo/make-demo.ts`: 206 training rows and 136
test rows, each species split 60/40, missing values left as empty cells. The seed of
the shuffle and the files themselves stay out of the repository, because either one is
the answer key.

## Limits and numbers

| Thing                    | Limit                                                               | Why                                                                       |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `train.csv` / `test.csv` | 5 MB / 2 MB                                                         | Files are in the app's 128 MiB free-plan file allocation                  |
| `solution.csv`           | 1.5 MB and 50,000 rows                                              | Stored in one server-only record; Durable Object rows are limited to 2 MB |
| Predictions file         | 2 MB                                                                | Sent in the action's JSON body; parsed and scored inside one request      |
| Daily submissions        | 1 to 20, default 5                                                  | Kaggle's default; limits leaderboard probing                              |
| Leaderboard size         | Designed for 200 participants and 5,000 submissions per competition | The leaderboard is derived in the browser from submission records         |
| Close delay              | About 2 minutes                                                     | The close task runs every minute                                          |

## Out of scope for v1

| Not in v1                                             | Why, and what would come next                                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI features of any kind                               | Nothing in the loop needs judgment from a model; a score must be exact and reproducible. See [ADR 0012](decisions/0012-integrations-email-only.md) |
| Choosing final submissions by hand                    | Auto-pick of the two best public submissions keeps the lesson; manual picks are the next feature                                                   |
| Teams                                                 | Needs invitations and merging; a class can enter as individuals                                                                                    |
| Log loss and ROC AUC                                  | Clipping conventions differ between Kaggle and scikit-learn, and AUC is undefined on a one-class split; worth doing with care later                |
| Private or invite-only competitions                   | Every competition is listed; the next step is an invite code checked by the submit action                                                          |
| Code submissions, notebooks, scoring scripts          | Needs sandboxed execution; result submission covers the lesson                                                                                     |
| Deleting a competition, changing files after creation | Needs cascades and re-scoring                                                                                                                      |
| Markdown descriptions                                 | Plain text avoids an HTML sanitiser in v1                                                                                                          |
| Mobile app                                            | The web app works on phones                                                                                                                        |

## Acceptance criteria for v1

On the deployed app, with fresh test accounts:

1. A host creates a competition from three valid files; three invalid files each produce
   the right file, row and column in the error.
2. A participant submits a valid file and sees the public score; a second participant's
   open page shows the new row without a reload.
3. An invalid prediction file is rejected with its problems and does not use a daily
   submission; the next valid file after the daily limit is refused with the reset time.
4. A participant cannot read `answer_keys` or `private_scores` through the record hooks,
   the agent tools, or any action response (Playwright spec).
5. A competition with a deadline two minutes out closes on its own; the final standings
   with the shake-up appear for every viewer; the host receives the email.
6. `npm run check` and `npm run design:gate` pass; `npx deepspace test run all` passes.
