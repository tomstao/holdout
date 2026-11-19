/**
 * How a value from someone's file appears in a message. Files are untrusted
 * and can be megabytes; a message quotes a little of them and never all.
 */

/** A value in quotes, cut if it is long. */
export function shown(value: string): string {
  return value.length > 40 ? `"${value.slice(0, 40)}…"` : `"${value}"`
}

/** The first few values, each as `shown` writes it, with `…` when there are more. */
export function shownList(values: readonly string[], most = 12): string {
  const listed = values.slice(0, most).map(shown).join(', ')
  return values.length > most ? `${listed}, …` : listed
}

/**
 * The largest magnitude a target or a prediction may have. No real quantity
 * comes near it. It exists so that scoring stays finite: the squared error of
 * two such values is at most 4e200, and 50,000 of those still sum to a number.
 * Without it a prediction of `1e200` overflowed RMSE to infinity.
 */
export const MAX_MAGNITUDE = 1e100

/** The sentence for a number beyond `MAX_MAGNITUDE`. */
export function tooLarge(text: string): string {
  return `${shown(text)} is too large to score. Use a number between -1e100 and 1e100.`
}
