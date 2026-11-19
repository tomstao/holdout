/**
 * Which rows of the answer key are scored on the public leaderboard, which
 * decide the private one, and which are not scored at all.
 *
 * A host either marks the rows in a `Usage` column of solution.csv (Kaggle's
 * convention: Public, Private, Ignored) or leaves it to `assignSplit`, which
 * draws a public share from every class.
 *
 * The seed is an argument, so the same file and seed always split the same
 * way. It must come from a random source the participants cannot predict:
 * they hold every test ID, and with the seed they could work out which rows
 * are public.
 */

export const SPLITS = ['public', 'private', 'ignored'] as const
export type Split = (typeof SPLITS)[number]

/** A row that counts towards a score. */
export type ScoredSplit = Exclude<Split, 'ignored'>

/** The `Usage` column's name, matched without regard to case. */
export const USAGE_COLUMN = 'Usage'

/** Read one `Usage` value. Case and surrounding spaces do not matter. */
export function parseUsage(value: string): Split | undefined {
  const usage = value.trim().toLowerCase()
  return SPLITS.find((split) => split === usage)
}

/** A seeded generator of numbers in [0, 1) (mulberry32). Equal seeds give equal sequences. */
export function randomSource(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The rows in a random order: each gets a random key and the keys are sorted.
 * The sort is stable, so equal keys keep their order and a seed always gives
 * the same result.
 */
function shuffled(rows: readonly number[], random: () => number): number[] {
  return rows
    .map((row) => ({ row, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ row }) => row)
}

/** How many of `size` rows go public: the share, but never none and never all. */
function publicCount(size: number, publicShare: number): number {
  return Math.min(size - 1, Math.max(1, Math.round(size * publicShare)))
}

/**
 * Split rows into public and private. `strata[i]` is the class of row `i`;
 * pass the same value for every row to split without stratifying
 * (regression).
 *
 * Guarantees, for two or more rows:
 *   - both halves have at least one row;
 *   - every class with two or more rows has a row in each half, with about
 *     `publicShare` of them public;
 *   - a class with a single row is private, unless every class has a single
 *     row, in which case the rows are split without regard to class;
 *   - the same strata, share and seed give the same split.
 *
 * A single row cannot be split and is private.
 */
export function assignSplit(
  strata: readonly string[],
  publicShare: number,
  seed: number,
): ScoredSplit[] {
  const split = strata.map((): ScoredSplit => 'private')
  if (strata.length < 2) return split

  const random = randomSource(seed)
  const classes = new Map<string, number[]>()
  strata.forEach((key, row) => {
    const rows = classes.get(key)
    if (rows) rows.push(row)
    else classes.set(key, [row])
  })

  const draw = (rows: readonly number[]): number => {
    const chosen = shuffled(rows, random).slice(0, publicCount(rows.length, publicShare))
    for (const row of chosen) split[row] = 'public'
    return chosen.length
  }

  let drawn = 0
  for (const rows of classes.values()) {
    if (rows.length >= 2) drawn += draw(rows)
  }
  // Every class has one row: there is nothing to stratify by.
  if (drawn === 0) draw(strata.map((_, row) => row))
  return split
}
