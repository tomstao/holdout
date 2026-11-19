/**
 * The demo files are accepted by the app's own dataset rules, keep each
 * species' share, and give no hint of the source file's order.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../../src/domain/csv'
import { validateDataset } from '../../src/domain/dataset'
import { ID_COLUMN, makeDemo, TARGET_COLUMN } from './demo'

const source = readFileSync(new URL('./penguins.csv', import.meta.url), 'utf8')

function table(text: string) {
  const parsed = parseCsv(text, { maxBytes: 1_000_000 })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.value
}

const column = (text: string, name: string) => {
  const { header, rows } = table(text)
  const at = header.indexOf(name)
  return rows.map((row) => row[at] ?? '')
}

const tally = (values: string[]) => {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}

describe('makeDemo', () => {
  const demo = makeDemo(source, 20261119)

  it('uses every penguin that was measured, once', () => {
    // 60, 27 and 49 test rows: 40% of each species, rounded.
    expect(demo.counts).toEqual({ source: 344, dropped: 2, train: 206, test: 136 })
    const ids = [...column(demo.train, ID_COLUMN), ...column(demo.test, ID_COLUMN)]
    expect(ids.map(Number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 342 }, (_, index) => index + 1),
    )
  })

  it('is accepted by the rules the create form applies', () => {
    const checked = validateDataset({
      taskType: 'classification',
      idColumn: ID_COLUMN,
      targetColumn: TARGET_COLUMN,
      publicShare: 0.3,
      seed: 7,
      files: { train: demo.train, test: demo.test, solution: demo.solution },
    })
    if (!checked.ok) throw new Error(JSON.stringify(checked.issues))
    expect(checked.value.labels).toEqual(['Adelie', 'Chinstrap', 'Gentoo'])
    expect(checked.value.trainRows).toBe(206)
    expect(checked.value.testRows).toBe(136)
    expect(checked.value.publicRows + checked.value.privateRows).toBe(136)
    expect(checked.value.publicRows).toBeGreaterThanOrEqual(38)
    expect(checked.value.publicRows).toBeLessThanOrEqual(44)
  })

  it('keeps the answers out of test.csv and the features out of solution.csv', () => {
    expect(table(demo.test).header).toEqual([
      'id',
      'island',
      'bill_length_mm',
      'bill_depth_mm',
      'flipper_length_mm',
      'body_mass_g',
      'sex',
      'year',
    ])
    expect(table(demo.train).header).toEqual([...table(demo.test).header, 'species'])
    expect(table(demo.solution).header).toEqual(['id', 'species'])
    expect(column(demo.solution, ID_COLUMN)).toEqual(column(demo.test, ID_COLUMN))
    expect(demo.test).not.toMatch(/Adelie|Chinstrap|Gentoo/)
  })

  it('keeps each species at its share in both files', () => {
    expect(tally(column(demo.train, TARGET_COLUMN))).toEqual({
      Adelie: 91,
      Chinstrap: 41,
      Gentoo: 74,
    })
    expect(tally(column(demo.solution, TARGET_COLUMN))).toEqual({
      Adelie: 60,
      Chinstrap: 27,
      Gentoo: 49,
    })
  })

  it('writes a missing value as an empty cell, never NA', () => {
    expect(demo.train + demo.test).not.toMatch(/\bNA\b/)
    const sexes = tally([...column(demo.train, 'sex'), ...column(demo.test, 'sex')])
    expect(sexes).toEqual({ female: 165, male: 168, '': 9 })
  })

  it('gives ids that say nothing about the source order or the species', () => {
    // In the source the first 152 rows are Adelie. Here the first 152 ids are a mix.
    const species = new Map<number, string>()
    const trainIds = column(demo.train, ID_COLUMN)
    const trainSpecies = column(demo.train, TARGET_COLUMN)
    trainIds.forEach((id, index) => species.set(Number(id), trainSpecies[index] ?? ''))
    const solutionIds = column(demo.solution, ID_COLUMN)
    const solutionSpecies = column(demo.solution, TARGET_COLUMN)
    solutionIds.forEach((id, index) => species.set(Number(id), solutionSpecies[index] ?? ''))
    const firstBlock = tally(
      Array.from({ length: 152 }, (_, index) => species.get(index + 1) ?? ''),
    )
    expect(firstBlock.Adelie).toBeLessThan(100)
    expect(firstBlock.Gentoo).toBeGreaterThan(30)
    // Test ids are spread through the range, not one block.
    const testIds = solutionIds.map(Number)
    expect(Math.min(...testIds)).toBeLessThan(20)
    expect(Math.max(...testIds)).toBeGreaterThan(322)
  })

  it('gives the same files for a seed and different ones for another', () => {
    expect(makeDemo(source, 20261119)).toEqual(demo)
    const other = makeDemo(source, 20261120)
    expect(other.solution).not.toBe(demo.solution)
    expect(other.counts).toEqual(demo.counts)
  })

  it('refuses input it cannot read honestly', () => {
    expect(() => makeDemo(source, -1)).toThrow('whole number')
    expect(() => makeDemo(source, 1.5)).toThrow('whole number')
    expect(() => makeDemo(source, 1, 0)).toThrow('between 0 and 1')
    expect(() => makeDemo(source, 1, 1)).toThrow('between 0 and 1')
    expect(() => makeDemo('species,island\n"Adelie",x\n', 1)).toThrow('quoted cells')
    expect(() => makeDemo('island,sex\nDream,male\n', 1)).toThrow('Expected species')
    expect(() => makeDemo(source.replace('Adelie,Torgersen,39.1', 'Adelie,39.1'), 1)).toThrow(
      'A row has 7 cells',
    )
  })
})
