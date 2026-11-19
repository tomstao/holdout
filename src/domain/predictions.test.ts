import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatCsv } from './csv'
import type { AnswerKeyRow } from './dataset'
import {
  checkPredictionsFile,
  matchAnswerKey,
  validatePredictions,
  type PredictionsFormat,
} from './predictions'
import type { Rejected } from './result'

const FORMAT: PredictionsFormat = {
  idColumn: 'id',
  targetColumn: 'species',
  taskType: 'classification',
  labels: ['Adelie', 'Chinstrap', 'Gentoo'],
  testRows: 3,
}

const KEY: AnswerKeyRow[] = [
  ['t1', 'Adelie', 'public'],
  ['t2', 'Gentoo', 'private'],
  ['t3', 'Chinstrap', 'private'],
]

const file = (rows: string[][], header = ['id', 'species']) => formatCsv(header, rows)

function problems(result: { ok: boolean }): Rejected['issues'] {
  if (result.ok) throw new Error('expected problems')
  return (result as Rejected).issues
}

describe('checkPredictionsFile', () => {
  it('reads a valid file, trimmed, in file order', () => {
    const result = checkPredictionsFile(
      file([
        [' t3 ', 'Chinstrap '],
        ['t1', 'Adelie'],
        ['t2', 'Gentoo'],
      ]),
      FORMAT,
    )
    expect(result).toEqual({
      ok: true,
      value: { ids: ['t3', 't1', 't2'], predictions: ['Chinstrap', 'Adelie', 'Gentoo'] },
    })
  })

  it('accepts the two columns in either order', () => {
    const result = checkPredictionsFile(
      file(
        [
          ['Adelie', 't1'],
          ['Gentoo', 't2'],
          ['Gentoo', 't3'],
        ],
        ['species', 'id'],
      ),
      FORMAT,
    )
    expect(result.ok && result.value.ids).toEqual(['t1', 't2', 't3'])
  })

  it('passes on the problems of a file that is not a table', () => {
    expect(problems(checkPredictionsFile('id,species\nt1,"Adelie\n', FORMAT))).toEqual([
      { row: 2, message: 'Field 2 opens a quote that is never closed.' },
    ])
  })

  it('names a missing column and the columns it found', () => {
    expect(
      problems(checkPredictionsFile(file([['t1', 'Adelie']], ['ID', 'label']), FORMAT)),
    ).toEqual([
      {
        row: 1,
        column: 'id',
        message: 'The file has no column with this name. Its columns are: "ID", "label".',
      },
      {
        row: 1,
        column: 'species',
        message: 'The file has no column with this name. Its columns are: "ID", "label".',
      },
    ])
  })

  it('wants exactly the two columns', () => {
    const extra = file(
      [
        ['t1', 'Adelie', '0.9'],
        ['t2', 'Gentoo', '0.8'],
        ['t3', 'Gentoo', '0.7'],
      ],
      ['id', 'species', 'confidence'],
    )
    expect(problems(checkPredictionsFile(extra, FORMAT))).toEqual([
      {
        row: 1,
        message: 'The file must have exactly 2 columns, "id" and "species"; it has 3.',
      },
    ])
  })

  it('reports empty and repeated IDs, empty predictions and unknown labels by row', () => {
    const result = checkPredictionsFile(
      file([
        ['t1', 'Adelie'],
        ['', 'Gentoo'],
        ['t1', ''],
        ['t4', 'Emperor'],
      ]),
      { ...FORMAT, testRows: 4 },
    )
    expect(problems(result)).toEqual([
      { row: 3, column: 'id', message: 'The ID is empty.' },
      { row: 4, column: 'id', message: 'The ID "t1" is already used in row 2.' },
      { row: 4, column: 'species', message: 'The prediction is empty.' },
      {
        row: 5,
        column: 'species',
        message: '"Emperor" is not one of the labels: Adelie, Chinstrap, Gentoo.',
      },
    ])
  })

  it('shortens a long label list', () => {
    const labels = Array.from({ length: 10 }, (_, index) => `L${index}`)
    const [issue] = problems(
      checkPredictionsFile(file([['t1', 'x']]), { ...FORMAT, labels, testRows: 1 }),
    )
    expect(issue?.message).toBe(
      '"x" is not one of the labels: L0, L1, L2, L3, L4, L5, L6, L7 and 2 more.',
    )
  })

  it('wants numbers for regression', () => {
    const format: PredictionsFormat = {
      idColumn: 'id',
      targetColumn: 'price',
      taskType: 'regression',
      testRows: 3,
    }
    const result = checkPredictionsFile(
      file(
        [
          ['t1', '12.5'],
          ['t2', '1e3'],
          ['t3', 'cheap'],
        ],
        ['id', 'price'],
      ),
      format,
    )
    expect(problems(result)).toEqual([
      { row: 4, column: 'price', message: '"cheap" is not a number.' },
    ])
  })

  it('counts the rows against the number of test rows', () => {
    expect(problems(checkPredictionsFile(file([['t1', 'Adelie']]), FORMAT))).toEqual([
      { message: 'The file has 1 row; the competition has 3 test rows.' },
    ])
  })

  it('accepts any label when the competition lists none', () => {
    const result = checkPredictionsFile(file([['t1', 'anything']]), {
      ...FORMAT,
      labels: undefined,
      testRows: 1,
    })
    expect(result.ok).toBe(true)
  })
})

describe('matchAnswerKey', () => {
  it('lines the predictions up with the key', () => {
    expect(
      matchAnswerKey(
        { ids: ['t3', 't1', 't2'], predictions: ['Chinstrap', 'Adelie', 'Gentoo'] },
        KEY,
        'id',
      ),
    ).toEqual({ ok: true, value: ['Adelie', 'Gentoo', 'Chinstrap'] })
  })

  it('reports IDs that are not test IDs, by row, and test IDs without a prediction', () => {
    const result = matchAnswerKey(
      { ids: ['t1', 't9', 't2'], predictions: ['Adelie', 'Gentoo', 'Gentoo'] },
      KEY,
      'id',
    )
    expect(problems(result)).toEqual([
      { row: 3, column: 'id', message: 'The ID "t9" is not a test ID.' },
      { column: 'id', message: 'The test ID "t3" has no prediction.' },
    ])
  })
})

describe('validatePredictions', () => {
  it('runs both checks', () => {
    const text = file([
      ['t1', 'Adelie'],
      ['t2', 'Gentoo'],
      ['t3', 'Gentoo'],
    ])
    expect(validatePredictions(text, FORMAT, KEY)).toEqual({
      ok: true,
      value: ['Adelie', 'Gentoo', 'Gentoo'],
    })
    expect(validatePredictions('', FORMAT, KEY).ok).toBe(false)
    const unknown = file([
      ['t1', 'Adelie'],
      ['t2', 'Gentoo'],
      ['t4', 'Gentoo'],
    ])
    expect(problems(validatePredictions(unknown, FORMAT, KEY))).toHaveLength(2)
  })

  it('accepts any order of a valid file and returns the predictions in key order', () => {
    const labels = FORMAT.labels ?? []
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...labels), { minLength: 1, maxLength: 30 }),
        fc.integer(),
        (targets, salt) => {
          const key: AnswerKeyRow[] = targets.map((target, index) => [
            `r${index}`,
            target,
            index % 2 === 0 ? 'public' : 'private',
          ])
          const rows = key.map(([id, target]) => [id, target])
          // A deterministic shuffle of the rows.
          const shuffled = rows
            .map((row, index) => ({ row, order: Math.sin(index + salt) }))
            .sort((a, b) => a.order - b.order)
            .map(({ row }) => row)
          const result = validatePredictions(
            file(shuffled),
            { ...FORMAT, testRows: key.length },
            key,
          )
          expect(result).toEqual({ ok: true, value: targets })
        },
      ),
    )
  })
})
