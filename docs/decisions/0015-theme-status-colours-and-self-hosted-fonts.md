# 0015. The theme sets its own status colours, and the fonts are served by the app

**Status:** Accepted, 2026-11-19

## Context

The Holdout theme is light: warm paper, ink, one burnt orange
([design/frontend.md](../design/frontend.md)). Two parts of the scaffold do not fit it.

- The scaffold's `src/styles.css` says the status colours (success, warning, info) are
  "intentionally NOT themed". They are tuned for its dark default. On paper, as text,
  success reaches about 2.5:1 and warning less; WCAG AA wants 4.5:1. The app uses them
  as text: ▲ in the shake-up, the tick under an accepted file, the icons in toasts.
- DeepSpace's style-tile page offers two ways to load a font: a `<link>` in
  `index.html` (in practice a font host such as Google Fonts) or a CSS `@import` in
  `styles.css`. The design names IBM Plex Sans and IBM Plex Mono.

## Decision

1. The `[data-theme='holdout']` block sets `success`, `warning` and `info` (and their
   foregrounds) as well as the tokens the product-polish page lists. `destructive` is a
   crimson, so it cannot be mistaken for the orange.
2. `--color-input` is darker than `--color-border`. A control's outline has to reach
   3:1 against the page; a table rule does not, and stays a hairline.
3. The fonts come from the `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`
   packages (OFL-1.1), imported in `src/styles.css` and built into the app's assets.
4. `scripts/theme-contrast.test.ts` reads the theme block and asserts AA for every pair
   of tokens the app puts together. It runs with the unit tests.

## Consequences

- Changing a colour in the theme is checked by `npm run check`, not by eye.
- Two runtime dependencies, both fonts with no code. The landing page stays free of
  third-party requests, and the app looks the same on a network that blocks a font host.
- Each font file lists its scripts with a `unicode-range`, so a browser downloads only
  what a page uses: Latin is about 20 KB a weight. The build carries about 60 font
  files for the other scripts (Cyrillic, Greek, Vietnamese), because participant names
  are user content.
- A scaffold update that touches the status colours in `styles.css` does not reach the
  app; the theme block wins.

## Alternatives

- **Keep the scaffold's status colours.** Fails AA on a light theme.
- **A dark theme.** The scaffold's colours would pass, but the design picks light:
  pages are projected in classrooms and read in daylight.
- **A font host through `<link>`.** One line and no dependencies, but a request to a
  third party from every page, including the static landing, and a different look when
  that host is blocked.
