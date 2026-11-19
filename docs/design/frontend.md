# Frontend design

The design source of truth for Holdout's screens. It follows DeepSpace's design workflow
([overview](https://docs.deep.space/design/overview.md),
[product polish](https://docs.deep.space/design/product-polish.md)): the scaffold's UI and
themes are placeholders; the app gets its own direction, theme and screens, built from the
scaffold's Base UI kit in `src/components/ui`.

## Design source

**Self-design against studied references** (the third path in DeepSpace's "Building an
app", step 3). The owner can switch to a design-prototype tool instead; this document then
becomes its brief, minus the layout sections.

References to screenshot into `docs/design/refs/` before building screens, and what each
one is for:

| Reference                   | Borrow                                                            | Do not borrow                     |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| A Kaggle competition page   | The information architecture: Overview, Data, Leaderboard, Submit | Name, logo, colours, copy         |
| Financial Times data tables | Number typography: tabular figures, right-aligned, quiet rules    | Their palette                     |
| Split-flap departure boards | The feeling of a board that flips at a fixed time (the close)     | Literal flap animation everywhere |

## Design Direction

This block goes, as written, at the top of `src/pages/index.tsx` during the design phase
([where it lives](https://docs.deep.space/design/overview.md#the-direction-block-lives-in-source)).

```text
Design Direction

Product: Small prediction competitions for a class: students submit predictions,
  a hidden answer key decides the final standings.
Emotion: The last ten minutes before the board flips, when your public rank
  might not survive.
Metaphor: A chalk-ruled scoreboard in a lecture hall with a sealed envelope pinned
  beside it.
References: split-flap departure boards; Financial Times data tables; exam answer
  sheets (OMR forms).
Signature: The sealed band. Before the deadline the private column is a sealed strip
  across the leaderboard; at the close it opens and rows slide to their final ranks.
Hero: A six-row leaderboard where the sealed band lifts and three rows trade places,
  every few seconds.

Style Tile
- Color: warm paper off-white dominant, ink near-black text, one muted signal orange
  for primary actions and the deadline; everything else neutral.
- Type: IBM Plex Sans (headings and body) with IBM Plex Mono for scores, IDs and CSV
  cells. Scores are compared to the fourth decimal, so tabular figures and a mono
  sibling keep columns aligned.
- Theme: light. Pages are projected in classrooms and read in daylight.
- Art direction: modern minimalism. The table is the hero: hairline rules, generous
  row height, one accent.
- Motion: mechanical. Rows slide to new ranks on a short linear ease; the countdown
  ticks; nothing else moves.
- Voice: second person; sentences of at most 14 words; numbers before adjectives
  ("3 of 5 submissions left", never "a few left").
```

Derived choices: radius 4 px (precise, not playful); Lucide outline icons only; 8 px
spacing grid; balanced density on forms, dense on tables; flat surfaces with borders, no
shadows except the kit's dialogs.

**Sentence test** ("could this describe any other product?"): the sealed band and the
shake-up only make sense for a competition with a held-out set. It passes.

## Theme

A new `[data-theme="holdout"]` block in `src/themes.css`, registered in `src/themes.ts`
and set on `<html>` in `index.html`; `color-scheme: light`. The scaffold's `slate` and
`paper` stay only as examples.

| Token                       | Intent                                                       |
| --------------------------- | ------------------------------------------------------------ |
| `background`                | warm paper, slightly off-white                               |
| `foreground`                | ink, near-black with a warm tint                             |
| `card`                      | a step lighter than the background, for tables and forms     |
| `muted`, `muted-foreground` | for secondary text, placeholders, the sealed band            |
| `primary` (+ foreground)    | the signal orange; primary actions and the deadline only     |
| `secondary`, `accent`       | neutral steps for hover and selection                        |
| `border`, `ring`            | hairline rules; the ring in primary                          |
| `success`, `destructive`    | the score accepted, the file rejected, and ▲ / ▼ in shake-up |

Every text pair must reach WCAG AA (4.5:1; 3:1 for large text), checked while the values
are chosen. The theme ships before the landing page, because both read its tokens.

### As built

| Token                          | Value                           | Notes                                         |
| ------------------------------ | ------------------------------- | --------------------------------------------- |
| `background`                   | `#f5f1e8`                       | paper                                         |
| `card`, `popover`              | `#fbf9f3`, `#fffdf9`            | each a step lighter                           |
| `foreground`                   | `#1d1a16`                       | ink; 15.4:1 on paper                          |
| `muted`, `secondary`, `accent` | `#ebe6d9` to `#e2dbc9`          | three neutral steps                           |
| `muted-foreground`             | `#5a5448`                       | 6.7:1 on paper, 5.4:1 on the darkest step     |
| `primary`, `ring`              | `#ad3f0c`                       | 5.3:1 as text on paper; 5.8:1 under its label |
| `destructive`                  | `#a3123a`                       | a crimson, so it is not read as the orange    |
| `success`, `warning`, `info`   | `#1c6b47`, `#7d5700`, `#1f5c86` | deep enough to be text on paper               |
| `border`, `input`              | `#d9d2c1`, `#8c8573`            | hairline rules; control outlines at 3.3:1     |
| `--radius`                     | `0.25rem`                       | `rounded-md` is 2 px, `rounded-lg` 4 px       |

- `scripts/theme-contrast.test.ts` reads the block from `src/themes.css` and asserts AA
  for every pair the app uses, including hovered fills (`bg-primary/90`) and tinted
  banners (`bg-warning/10`). Why the status colours are themed and the fonts are served
  by the app: [ADR 0015](../decisions/0015-theme-status-colours-and-self-hosted-fonts.md).
- Type: `--font-sans` is IBM Plex Sans, `--font-mono` IBM Plex Mono (weights 400, 500,
  600). Mono is for scores, ranks, IDs, column names, file names and CSV cells.
  Durations and sizes in a sentence stay in the sans face with tabular figures.
- Orange appears on primary buttons, the focus ring, the wordmark's band and the
  countdown to the deadline. The status badge is an outline, and tooltips are ink.
- Surfaces are flat: the kit's buttons, inputs, selects and tabs lost their shadows;
  menus, popovers, dialogs and toasts keep theirs, because they float.
- Wordmark (`src/components/Wordmark.tsx`): a three-row board whose middle row is the
  sealed band, and "holdout" in the mono face. `public/favicon.svg` is the same drawing
  on ink; `scripts/favicon.py` draws the `.ico` from the same numbers.
- Navigation: wordmark, "Competitions", "Host a competition"; the current section has an
  ink underline. Settings and Sign out are in the account menu. The bar and the
  competition pages share one 56 rem column.

## Screens

Routes and files are in [architecture.md](../architecture.md#layers-and-folders).

### `/` Landing (static)

Composition budget: navigation, hero, one "how the split works" section, a call to action
and a footer. Hero headline of 3 to 8 words, for example "Your public score is not your
grade." The hero visual is the signature: a code-built leaderboard (React and SVG, never
an AI image) whose sealed band lifts on a loop, gated by `prefers-reduced-motion`. Body
copy under 150 words. Calls to action: "Try the demo competition" and "Host a
competition".

### `/home` Competition list

First line of `src/pages/(app)/home.tsx`:

```tsx
/* home pattern: product-preview-first — the live competition list; visitors see it read-only with a sign-in prompt */
```

- Signed in: "Hosting", "Entered", "Open" and "Recently closed" sections; a "Host a
  competition" button above the fold.
- Signed out: "Open" and "Recently closed" with an inline sign-in call to action.
- Row: title, summary, host, participants, leader's score (mono), deadline countdown or
  "Closed".
- Empty: `EmptyState` with "Host a competition".

As built:

- One table per section, the same four columns: competition, participants, top score,
  deadline. On a phone the two number columns fold into the line under the summary.
- The top score says what it was measured on: "public" while the competition runs,
  "final" once it is closed.
- Time left is to the minute until the last minute, so a page of rows does not tick every
  second. It is the row's only orange.
- A section shows eight rows, then "Show all n". Each row is one live subscription (its
  submissions, or its final standings), so the page opens only as many as it shows.
- Running competitions come first, the one that ends soonest on top; closed ones follow,
  the latest first (`src/domain/listing.ts`).
- The visitor's sign-in prompt is an outline button: the orange one is already in the bar.

### `/c/:id` Competition

Header: title, host, status badge, deadline (local time, UTC on hover), countdown. Tabs
(`Tabs` from the kit; the selected tab in the URL query so links work):

| Tab                   | Content                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leaderboard (default) | Live table; the viewer's row pinned when off-screen; after close, final standings with private score, public rank and shake-up, plus a toggle back to the public board |
| Overview              | Description; the metric in one sentence with its direction; the rules (daily limit, public share, two auto-picked finals)                                              |
| Data                  | Three download buttons with sizes; the ID and target columns; a five-row preview of `sample_submission.csv`                                                            |
| Submit (signed in)    | Drop zone; local check result; Submit (`Button loading`); "2 of 5 today, resets in 4 h"; my submissions                                                                |
| Edit (host only)      | Title, summary, description, deadline (later only)                                                                                                                     |

Not found: "This competition does not exist." with a link to `/home`.

### `/host/new` Create a competition

One page, three sections: details, files, rules. Each file has its own drop zone; local
validation runs on drop and lists problems under that file, with file, row and column.
The Create button is disabled until all three files pass. On success, go to the new
competition.

## Components

Use the kit; never browser defaults ([product polish](https://docs.deep.space/design/product-polish.md), "UI primitives").

| Need                      | Use                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Task type, metric         | `Select`                                                                                                            |
| Text fields               | `Input`, `Textarea`, `Label`, with an inline error `<p>` under the field                                            |
| Deadline                  | `Input type="datetime-local"`, the time zone named next to it                                                       |
| File drop                 | A `features/create/FileDrop` built on a hidden `<input type="file">` and a `Button`                                 |
| Tables                    | Token-styled `<table>`: `border-border` rows, `<th scope="col">`, numbers right-aligned in mono with `tabular-nums` |
| Status, shake-up          | `Badge`; ▲ / ▼ glyphs plus the number, never colour alone                                                           |
| Feedback                  | `useToast`; `Button loading`; `EmptyState`; `animate-pulse` placeholders shaped like the rows                       |
| Confirm (deadline change) | `ConfirmModal` naming the new deadline                                                                              |

## Interaction rules

- Every write goes through `callAction`; show `Button loading` while it runs, then a
  toast with the result. Server issues appear next to the field or file they name.
- Disable Submit and Create while a call is in flight (it also prevents double
  submissions, [ADR 0008](../decisions/0008-daily-limit-with-uniqueon-slots.md)).
- Live updates: a moved row highlights for about a second; an `aria-live="polite"`
  region announces the viewer's own rank change only, not every row.
- Scores always show the competition's decimals; the full value is in a tooltip.
- Phones: the leaderboard keeps rank, name and score; other columns move into a row
  disclosure.

## Done when

- `npm run design:gate` passes and joins `npm run check`.
- The eyeball checklist in
  [anti-AI gate](https://docs.deep.space/design/anti-ai-gate.md#the-eyeball-checklist)
  passes for the landing.
- The smoke spec asserts the real H1, the absence of placeholder copy, an app-specific
  `<title>`, and that a primitive opens and a toast appears
  ([testing.md](../testing.md)).
- Screens are compared side by side with the screenshots in `docs/design/refs/`.
