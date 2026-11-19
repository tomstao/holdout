/**
 * Theme catalog.
 *
 * `holdout` is the app's theme (src/themes.css, docs/design/frontend.md).
 * The scaffold's two placeholders stay as examples of the token contract:
 * `slate` (dark, defined in styles.css) and `paper` (light, in themes.css).
 * To add another:
 *   1. Add a `[data-theme="my-id"] { ... }` block in src/themes.css with
 *      the shadcn token overrides (include `color-scheme: light;` for
 *      light themes).
 *   2. Add an entry here for type safety, autocomplete, and UI display.
 *   3. Add the theme's background to the first-paint <style> block in
 *      index.html so the pre-CSS frame matches (no white flash).
 *   4. Switch via `data-theme` on <html> in index.html.
 *
 * Color values live in styles.css / themes.css — this file is metadata only.
 */

export const THEMES = [
  {
    id: 'holdout',
    label: 'Holdout',
    description: 'Warm paper, ink and one burnt signal orange. The app theme.',
  },
  {
    id: 'slate',
    label: 'Slate',
    description: 'Neutral dark scaffold baseline. An example only.',
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Light scaffold example of the token contract. An example only.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the currently active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'holdout'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'holdout'
}

/** Look up a theme entry by id, or fall back to the first theme. */
export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
