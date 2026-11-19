/**
 * Writes the demo competition's files (spec F8), for the owner to upload at
 * /host/new on the deployed app.
 *
 *   node scripts/demo/make-demo.ts                 draws a seed and prints it
 *   node scripts/demo/make-demo.ts --seed 12345    the same files again
 *
 * Output: scripts/demo/out/train.csv, test.csv and solution.csv. That folder
 * is git-ignored, and so is the seed: with either, anyone could submit the
 * answers. Keep the seed somewhere private if you may need the files again.
 *
 * Source: scripts/demo/penguins.csv, from
 * https://github.com/allisonhorst/palmerpenguins (CC0). Gorman KB, Williams
 * TD, Fraser WR (2014), PLoS ONE 9(3): e90081.
 *
 * Needs Node 22.18 or later, which runs TypeScript directly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ID_COLUMN, makeDemo, TARGET_COLUMN } from './demo.ts'

const here = import.meta.dirname
const flag = process.argv.indexOf('--seed')
const given = flag < 0 ? undefined : Number(process.argv[flag + 1])
if (given !== undefined && !(Number.isInteger(given) && given >= 0)) {
  console.error('--seed takes a whole number, for example --seed 12345')
  process.exit(1)
}
const seed = given ?? crypto.getRandomValues(new Uint32Array(1))[0]

const demo = makeDemo(readFileSync(join(here, 'penguins.csv'), 'utf8'), seed)
const out = join(here, 'out')
mkdirSync(out, { recursive: true })
for (const name of ['train', 'test', 'solution'] as const) {
  writeFileSync(join(out, `${name}.csv`), demo[name], 'utf8')
}

const { counts } = demo
console.log(`Wrote train.csv (${counts.train} rows), test.csv and solution.csv (${counts.test} rows)
to ${out}
from ${counts.source} penguins; ${counts.dropped} without measurements were dropped.

Seed: ${given === undefined ? `${seed} (drawn now; keep it private to rebuild these files)` : seed}

At /host/new:
  Title         Palmer Penguins (practice)
  Summary       Predict a penguin's species from its measurements. Practice: the labels are public.
  Task, metric  Classification, Accuracy
  ID column     ${ID_COLUMN}
  Target column ${TARGET_COLUMN}
  Deadline      as far ahead as the form allows (90 days)
  Files         the three in the folder above
`)
