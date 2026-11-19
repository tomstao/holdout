/**
 * The demo competition's three files, built from Palmer Penguins (spec F8).
 *
 * The labels of this data set are public, so the demo is practice. What this
 * does about it is modest: the rows are shuffled and given new ids by a seed
 * that is not in the repository, so nobody can rebuild solution.csv from the
 * source file's order. Someone who matches rows on their measurements still
 * can; the competition says it is practice.
 *
 * Self-contained on purpose: Node runs this file as it is (make-demo.ts), and
 * Node's own TypeScript support cannot follow the extensionless imports the
 * app's modules use. The test next to it runs the output through the app's
 * dataset rules instead.
 */

export interface DemoFiles {
  train: string
  test: string
  solution: string
  counts: { source: number; dropped: number; train: number; test: number }
}

export const ID_COLUMN = 'id'
export const TARGET_COLUMN = 'species'

const MEASUREMENTS = ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g']

/** A small seeded generator (mulberry32), so a seed always gives the same files. */
function randomSource(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let last = result.length - 1; last > 0; last--) {
    const pick = Math.floor(random() * (last + 1))
    const moved = result[last]
    result[last] = result[pick]
    result[pick] = moved
  }
  return result
}

const toCsv = (rows: readonly (readonly string[])[]) =>
  rows.map((row) => row.join(',')).join('\n') + '\n'

/**
 * `source` is penguins.csv as published: a header, then one penguin per
 * line, `NA` for a missing value, no quoted cells.
 *
 *   - `NA` becomes an empty cell.
 *   - A penguin with no measurements at all is dropped (two of them).
 *   - Each species is split on its own, so train and test keep its share.
 *   - Every row gets a new id, 1 to N, in an order unrelated to the source.
 */
export function makeDemo(source: string, seed: number, testShare = 0.4): DemoFiles {
  if (!Number.isInteger(seed) || seed < 0) throw new Error('The seed must be a whole number.')
  if (!(testShare > 0 && testShare < 1)) throw new Error('The test share must be between 0 and 1.')
  if (source.includes('"'))
    throw new Error('The source file has quoted cells; this reader does not.')

  const lines = source.split(/\r?\n/).filter((line) => line !== '')
  const header = (lines[0] ?? '').split(',')
  const target = header.indexOf(TARGET_COLUMN)
  const measured = MEASUREMENTS.map((name) => header.indexOf(name))
  if (target < 0 || measured.includes(-1)) {
    throw new Error(`Expected ${TARGET_COLUMN} and ${MEASUREMENTS.join(', ')} in the header.`)
  }
  const features = header.filter((_, index) => index !== target)

  const all = lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => (cell === 'NA' ? '' : cell))
    if (cells.length !== header.length) throw new Error(`A row has ${cells.length} cells: ${line}`)
    return cells
  })
  const penguins = all.filter((cells) => measured.some((index) => cells[index] !== ''))

  const random = randomSource(seed)
  const bySpecies = new Map<string, string[][]>()
  for (const cells of shuffled(penguins, random)) {
    const species = cells[target] ?? ''
    bySpecies.set(species, [...(bySpecies.get(species) ?? []), cells])
  }

  // Species in name order, so the split does not depend on which came first.
  const picked: { cells: string[]; inTest: boolean }[] = []
  for (const species of [...bySpecies.keys()].sort()) {
    const rows = bySpecies.get(species) ?? []
    const testRows = Math.round(rows.length * testShare)
    rows.forEach((cells, index) => picked.push({ cells, inTest: index < testRows }))
  }

  // New ids in a fresh random order: train and test ids interleave.
  const numbered = shuffled(picked, random).map((row, index) => ({ ...row, id: String(index + 1) }))
  const without = (cells: string[]) => cells.filter((_, index) => index !== target)

  const train = numbered.filter((row) => !row.inTest)
  const test = numbered.filter((row) => row.inTest)
  return {
    train: toCsv([
      [ID_COLUMN, ...features, TARGET_COLUMN],
      ...train.map((row) => [row.id, ...without(row.cells), row.cells[target] ?? '']),
    ]),
    test: toCsv([[ID_COLUMN, ...features], ...test.map((row) => [row.id, ...without(row.cells)])]),
    solution: toCsv([
      [ID_COLUMN, TARGET_COLUMN],
      ...test.map((row) => [row.id, row.cells[target] ?? '']),
    ]),
    counts: {
      source: all.length,
      dropped: all.length - penguins.length,
      train: train.length,
      test: test.length,
    },
  }
}
