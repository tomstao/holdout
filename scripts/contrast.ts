/**
 * WCAG 2 contrast maths and a reader for one theme block of src/themes.css.
 * Used by scripts/theme-contrast.test.ts, which holds the Holdout theme to AA
 * (docs/design/frontend.md, "Theme").
 */

export type Rgb = readonly [number, number, number]

/** `#rgb` or `#rrggbb` to 0-255 channels. */
export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match?.[1]) throw new Error(`Not a hex colour: ${hex}`)
  const digits = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1]
  return [0, 2, 4].map((at) => Number.parseInt(digits.slice(at, at + 2), 16)) as unknown as Rgb
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(colour: Rgb): number {
  const [red, green, blue] = colour.map((channel) => {
    const share = channel / 255
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** Contrast ratio, 1 to 21. AA wants 4.5 for text and 3 for large text and control outlines. */
export function contrast(first: Rgb, second: Rgb): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [
    number,
    number,
  ]
  return (light + 0.05) / (dark + 0.05)
}

/** `top` at `alpha` painted over `bottom`, as Tailwind's `bg-x/10` does. */
export function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return top.map((channel, index) =>
    Math.round(channel * alpha + (bottom[index] ?? 0) * (1 - alpha)),
  ) as unknown as Rgb
}

/** The `--color-*` hex values of `[data-theme='<id>']`, keyed without the prefix. */
export function themeColours(css: string, id: string): Map<string, Rgb> {
  const block = new RegExp(`\\[data-theme=['"]${id}['"]\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1]
  if (block === undefined) throw new Error(`No [data-theme='${id}'] block`)
  const colours = new Map<string, Rgb>()
  for (const [, name, value] of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    if (name && value) colours.set(name, parseHex(value))
  }
  return colours
}
