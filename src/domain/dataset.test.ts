import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatCsv, parseCsv } from './csv'
import {
  DATASET_LIMITS,
  parseNumber,
  validateDataset,
  type Dataset,
  type DatasetInput,
  type DatasetRejected,
} from './dataset'

type Files = DatasetInput['files']

/** Six penguins to learn from, six to predict. */
const TRAIN = formatCsv(
  ['id', 'bill', 'species'],
  [
    ['a1', '39.1', 'Adelie'],
    ['a2', '46.5', 'Gentoo'],
    ['a3', '38.2', 'Adelie'],
    ['a4', '49.0', 'Chinstrap'],
    ['a5', '37.8', 'Adelie'],
    ['a6', '47.1', 'Gentoo'],
  ],
)
const TEST = formatCsv(
  ['id', 'bill'],
  [
    ['t1', '40.0'],
    ['t2', '45.9'],
    ['t3', '50.2'],
    ['t4', '38.8'],
    ['t5', '46.0'],
    ['t6', '49.5'],
  ],
)
const SOLUTION_ROWS = [
  ['t1', 'Adelie'],
  ['t2', 'Gentoo'],
  ['t3', 'Chinstrap'],
  ['t4', 'Adelie'],
  ['t5', 'Gentoo'],
  ['t6', 'Chinstrap'],
]
const SOLUTION = formatCsv(['id', 'species'], SOLUTION_ROWS)

function input(files: Partial<Files> = {}, options: Partial<DatasetInput> = {}): DatasetInput {
  return {
    taskType: 'classification',
    idColumn: 'id',
    targetColumn: 'species',
    publicShare: 0.3,
    seed: 1,
    ...options,
    files: { train: TRAIN, test: TEST, solution: SOLUTION, ...files },
  }
}

function accepted(given: DatasetInput): Dataset {
  const result = validateDataset(given)
  if (!result.ok) throw new Error(`expected a dataset, got: ${JSON.stringify(result.issues)}`)
  return result.value
}

function rejected(given: DatasetInput): DatasetRejected {
  const result = validateDataset(given)
  if (result.ok) throw new Error('expected a rejection')
  return result
}

/** Regression files: `rows` test rows whose target is the row number. */
function regression(trainTargets: string[], solutionTargets: string[]): DatasetInput {
  return input(
    {
      train: formatCsv(
        ['id', 'price'],
        trainTargets.map((target, row) => [`a${row}`, target]),
      ),
      test: formatCsv(
        ['id', 'rooms'],
        solutionTargets.map((_, row) => [`t${row}`, '3']),
      ),
      solution: formatCsv(
        ['id', 'price'],
        solutionTargets.map((target, row) => [`t${row}`, target]),
      ),
    },
    { taskType: 'regression', targetColumn: 'price' },
  )
}

describe('parseNumber', () => {
  it('reads decimal numbers', () => {
    expect(parseNumber('12')).toBe(12)
    expect(parseNumber('-0.5')).toBe(-0.5)
    expect(parseNumber('+3.')).toBe(3)
    expect(parseNumber('.25')).toBe(0.25)
    expect(parseNumber('1e-3')).toBe(0.001)
    expect(parseNumber('2.5E2')).toBe(250)
    expect(parseNumber('  7 ')).toBe(7)
  })

  it('refuses everything else', () => {
    for (const text of ['', ' ', 'abc', '1,000', '0x10', 'NaN', 'Infinity', '-inf', '1e', '.']) {
      expect(parseNumber(text), text).toBeUndefined()
    }
    expect(parseNumber('1 2')).toBeUndefined()
    expect(parseNumber('1e999')).toBeUndefined()
  })
})

describe('validateDataset: accepted files', () => {
  it('builds the answer key, the labels and the counts', () => {
    const dataset = accepted(input())
    expect(dataset.answerKey.map(([id, target]) => [id, target])).toEqual(SOLUTION_ROWS)
    expect(dataset.labels).toEqual(['Adelie', 'Chinstrap', 'Gentoo'])
    expect(dataset.trainRows).toBe(6)
    expect(dataset.testRows).toBe(6)
    expect(dataset.publicRows + dataset.privateRows).toBe(6)
    expect(dataset.ignoredRows).toBe(0)
    expect(dataset.splitByHost).toBe(false)
  })

  it('splits every class between public and private when there is no Usage column', () => {
    const { answerKey } = accepted(input())
    for (const label of ['Adelie', 'Chinstrap', 'Gentoo']) {
      const splits = answerKey.filter(([, target]) => target === label).map(([, , split]) => split)
      expect(splits.sort()).toEqual(['private', 'public'])
    }
  })

  it('gives the same split for the same seed and another for another seed', () => {
    const rows = Array.from({ length: 200 }, (_, row) => [`t${row}`, row % 2 ? 'Adelie' : 'Gentoo'])
    const files = {
      test: formatCsv(
        ['id', 'bill'],
        rows.map(([id]) => [id ?? '', '40']),
      ),
      solution: formatCsv(['id', 'species'], rows),
    }
    const first = accepted(input(files, { seed: 99 })).answerKey
    expect(accepted(input(files, { seed: 99 })).answerKey).toEqual(first)
    expect(accepted(input(files, { seed: 100 })).answerKey).not.toEqual(first)
    expect(first.filter(([, , split]) => split === 'public')).toHaveLength(60)
  })

  it("uses the host's Usage column when there is one", () => {
    const solution = formatCsv(
      ['id', 'species', 'usage'],
      [
        ['t1', 'Adelie', 'Public'],
        ['t2', 'Gentoo', 'private'],
        ['t3', 'Chinstrap', ' PRIVATE '],
        ['t4', 'Adelie', 'Ignored'],
        ['t5', 'Gentoo', 'Private'],
        ['t6', 'Chinstrap', 'Public'],
      ],
    )
    const dataset = accepted(input({ solution }))
    expect(dataset.answerKey.map(([, , split]) => split)).toEqual([
      'public',
      'private',
      'private',
      'ignored',
      'private',
      'public',
    ])
    expect(dataset).toMatchObject({
      publicRows: 2,
      privateRows: 3,
      ignoredRows: 1,
      splitByHost: true,
    })
  })

  it('matches IDs and labels without surrounding spaces, in any row order', () => {
    const solution = formatCsv(
      ['id', 'species'],
      [...SOLUTION_ROWS].reverse().map(([id, label]) => [` ${id ?? ''} `, `${label ?? ''} `]),
    )
    const dataset = accepted(input({ solution }))
    expect(dataset.answerKey[0]?.slice(0, 2)).toEqual(['t6', 'Chinstrap'])
    expect(dataset.labels).toEqual(['Adelie', 'Chinstrap', 'Gentoo'])
  })

  it('writes a sample submission: every test ID with the most common training label', () => {
    expect(accepted(input()).sampleSubmission).toBe(
      'id,species\nt1,Adelie\nt2,Adelie\nt3,Adelie\nt4,Adelie\nt5,Adelie\nt6,Adelie\n',
    )
  })

  it('only suggests a label the competition has', () => {
    // "Macaroni" is the most common training label but is not in the answer key.
    const train = formatCsv(
      ['id', 'species'],
      [
        ['a1', 'Macaroni'],
        ['a2', 'Macaroni'],
        ['a3', 'Gentoo'],
      ],
    )
    expect(accepted(input({ train })).sampleSubmission).toContain('t1,Gentoo\n')
    const unrelated = formatCsv(['id', 'species'], [['a1', 'Macaroni']])
    expect(accepted(input({ train: unrelated })).sampleSubmission).toContain('t1,Adelie\n')
  })

  it('accepts a regression dataset and suggests the training mean', () => {
    const dataset = accepted(regression(['10', '20.5', ' 31 '], ['12', '1e1', '-3.25', '40']))
    expect(dataset.labels).toBeNull()
    expect(dataset.answerKey.map(([id, target]) => [id, target])).toEqual([
      ['t0', '12'],
      ['t1', '1e1'],
      ['t2', '-3.25'],
      ['t3', '40'],
    ])
    expect(dataset.publicRows).toBe(1)
    expect(dataset.privateRows).toBe(3)
    expect(dataset.sampleSubmission).toBe('id,price\nt0,20.5\nt1,20.5\nt2,20.5\nt3,20.5\n')
  })

  it('writes the training mean with at most six decimals', () => {
    const dataset = accepted(regression(['1', '1', '2'], ['1', '2']))
    expect(dataset.sampleSubmission).toContain('t0,1.333333\n')
  })
})

describe('validateDataset: refused files', () => {
  it('reports a file that is not a table, and still checks the others', () => {
    const result = rejected(
      input({
        train: 'id,species\na1,"Adelie\n',
        solution: formatCsv(['id', 'species'], [['t1', '']]),
      }),
    )
    expect(result.issues[0]).toEqual({
      file: 'train',
      row: 2,
      message: 'Field 2 opens a quote that is never closed.',
    })
    expect(result.issues.map((issue) => issue.file)).toContain('solution')
  })

  it('reports a file with a header and no rows', () => {
    expect(rejected(input({ test: 'id,bill\n' })).issues).toEqual([
      { file: 'test', message: 'The file has a header but no rows.' },
    ])
  })

  it('reports a missing ID or target column and lists the columns it found', () => {
    const result = rejected(input({}, { idColumn: 'ID', targetColumn: 'label' }))
    expect(result.issues).toEqual([
      {
        file: 'train',
        row: 1,
        column: 'ID',
        message: 'The file has no column with this name. Its columns are: "id", "bill", "species".',
      },
      expect.objectContaining({ file: 'train', column: 'label' }),
      expect.objectContaining({ file: 'test', column: 'ID' }),
      expect.objectContaining({ file: 'solution', column: 'ID' }),
      expect.objectContaining({ file: 'solution', column: 'label' }),
    ])
  })

  it('shortens a long list of columns', () => {
    const header = Array.from({ length: 15 }, (_, column) => `c${column}`)
    const train = formatCsv(header, [header.map(() => '1')])
    const message = rejected(input({ train })).issues[0]?.message
    expect(message).toContain('"c11", ….')
    expect(message).not.toContain('"c12"')
  })

  it('refuses a test file that contains the target', () => {
    const test = formatCsv(['id', 'species'], SOLUTION_ROWS)
    expect(rejected(input({ test })).issues).toEqual([
      {
        file: 'test',
        row: 1,
        column: 'species',
        message: 'test.csv must not contain the target column. Participants download this file.',
      },
    ])
  })

  it('reports empty and repeated IDs with their rows', () => {
    const train = formatCsv(
      ['id', 'species'],
      [
        ['a1', 'Adelie'],
        [' ', 'Gentoo'],
        ['a1', 'Gentoo'],
      ],
    )
    expect(rejected(input({ train })).issues).toEqual([
      { file: 'train', row: 3, column: 'id', message: 'The ID is empty.' },
      { file: 'train', row: 4, column: 'id', message: 'The ID "a1" is already used in row 2.' },
    ])
  })

  it('reports an empty classification target', () => {
    const train = formatCsv(
      ['id', 'species'],
      [
        ['a1', ''],
        ['a2', 'Gentoo'],
      ],
    )
    expect(rejected(input({ train })).issues).toEqual([
      { file: 'train', row: 2, column: 'species', message: 'The target is empty.' },
    ])
  })

  it('reports regression targets that are not numbers', () => {
    const result = rejected(regression(['1', 'cheap', ''], ['2', 'NaN', '3']))
    expect(result.issues).toEqual([
      { file: 'train', row: 3, column: 'price', message: '"cheap" is not a number.' },
      { file: 'train', row: 4, column: 'price', message: 'The target is empty.' },
      { file: 'solution', row: 3, column: 'price', message: '"NaN" is not a number.' },
    ])
  })

  it('reports regression targets too large to score', () => {
    const result = rejected(regression(['1', '1e200'], ['-2e150', '3']))
    expect(result.issues).toEqual([
      {
        file: 'train',
        row: 3,
        column: 'price',
        message: '"1e200" is too large to score. Use a number between -1e100 and 1e100.',
      },
      {
        file: 'solution',
        row: 2,
        column: 'price',
        message: '"-2e150" is too large to score. Use a number between -1e100 and 1e100.',
      },
    ])
  })

  it('cuts a long value in a message', () => {
    const long = 'x'.repeat(60)
    const message = rejected(regression([long], ['1', '2'])).issues[0]?.message
    expect(message).toBe(`"${'x'.repeat(40)}…" is not a number.`)
  })

  it('reports IDs that are in one of test.csv and solution.csv only', () => {
    const solution = formatCsv(['id', 'species'], [...SOLUTION_ROWS.slice(0, 5), ['t9', 'Gentoo']])
    expect(rejected(input({ solution })).issues).toEqual([
      { file: 'test', row: 7, column: 'id', message: 'The ID "t6" is not in solution.csv.' },
      { file: 'solution', row: 7, column: 'id', message: 'The ID "t9" is not in test.csv.' },
    ])
  })

  it('reports Usage values it does not know', () => {
    const solution = formatCsv(
      ['id', 'species', 'Usage'],
      SOLUTION_ROWS.map(([id, label], row) => [
        id ?? '',
        label ?? '',
        row === 2 ? 'Test' : 'Public',
      ]),
    )
    expect(rejected(input({ solution })).issues).toEqual([
      {
        file: 'solution',
        row: 4,
        column: 'Usage',
        message: '"Test" is not Public, Private or Ignored.',
      },
    ])
  })

  it('needs a Public and a Private row in a Usage column', () => {
    const withUsage = (usage: string) =>
      formatCsv(
        ['id', 'species', 'Usage'],
        SOLUTION_ROWS.map(([id, label]) => [id ?? '', label ?? '', usage]),
      )
    expect(rejected(input({ solution: withUsage('Public') })).issues).toEqual([
      {
        file: 'solution',
        row: 1,
        column: 'Usage',
        message: 'No row is marked Private. Both halves need a row.',
      },
    ])
    expect(
      rejected(input({ solution: withUsage('Ignored') })).issues.map((issue) => issue.message),
    ).toEqual([
      'No row is marked Public. Both halves need a row.',
      'No row is marked Private. Both halves need a row.',
    ])
  })

  it('needs two rows to split', () => {
    const result = rejected(
      input({
        test: formatCsv(['id', 'bill'], [['t1', '40']]),
        solution: formatCsv(['id', 'species'], [['t1', 'Adelie']]),
      }),
    )
    expect(result.issues).toEqual([
      {
        file: 'solution',
        message: 'The file needs at least 2 rows to be split into public and private.',
      },
    ])
  })

  it('reports at most 20 problems per file and counts the rest', () => {
    const train = formatCsv(
      ['id', 'species'],
      Array.from({ length: 25 }, (_, row) => [`a${row}`, '']),
    )
    const result = rejected(input({ train }))
    expect(result.issues).toHaveLength(20)
    expect(result.omitted).toBe(5)
    expect(result.omittedByFile).toEqual({ train: 5, test: 0, solution: 0 })
  })

  it('keeps the count of problems the CSV reader left out', () => {
    const test = 'id,bill\n' + 't\n'.repeat(30)
    const result = rejected(input({ test }))
    expect(result.issues).toHaveLength(20)
    expect(result.issues.every((issue) => issue.file === 'test')).toBe(true)
    expect(result.omittedByFile).toEqual({ train: 0, test: 10, solution: 0 })
  })

  it('lists problems file by file: train, test, solution', () => {
    const result = rejected(
      input({
        train: formatCsv(['id', 'species'], [['', 'Adelie']]),
        test: formatCsv(['id', 'bill'], [['', '1']]),
        solution: formatCsv(
          ['id', 'species'],
          [
            ['', 'Adelie'],
            ['t2', 'Gentoo'],
          ],
        ),
      }),
    )
    expect(result.issues.map((issue) => issue.file)).toEqual([
      'train',
      'test',
      'solution',
      'solution',
    ])
  })
})

describe('validateDataset: limits', () => {
  it('refuses a train file over 5 MB', () => {
    const train = 'id,species\n' + 'a,Adelie\n'.repeat(560_000)
    expect(rejected(input({ train })).issues).toEqual([
      { file: 'train', message: 'The file is 5.05 MB; the limit is 5 MB.' },
    ])
  })

  it('refuses a solution file over 50,000 rows', () => {
    const solution = 'id,species\n' + 't,A\n'.repeat(50_001)
    expect(rejected(input({ solution })).issues).toEqual([
      { file: 'solution', message: 'The file has more than 50,000 rows.' },
    ])
  })

  it('refuses an answer key that fits as CSV but not as the stored record', () => {
    // 50,000 rows of "r000001,Chinstrap" are 0.9 MB of CSV and 1.6 MB of JSON.
    const rows = Array.from({ length: 50_000 }, (_, row) => [
      `r${String(row).padStart(6, '0')}`,
      'Chinstrap',
    ])
    const solution = formatCsv(['id', 'species'], rows)
    const test = formatCsv(
      ['id', 'bill'],
      rows.map(([id]) => [id ?? '', '1']),
    )
    expect(solution.length).toBeLessThan(DATASET_LIMITS.solutionBytes)
    const result = rejected(input({ solution, test }))
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ file: 'solution' })
    expect(result.issues[0]?.message).toMatch(
      /^The answer key takes 1\.\d+ MB once prepared for storage; the limit is 1\.5 MB\./,
    )
  })

  it('accepts 50,000 rows when the IDs are short', () => {
    const rows = Array.from({ length: 50_000 }, (_, row) => [String(row), row % 2 ? 'a' : 'b'])
    const dataset = accepted(
      input({
        solution: formatCsv(['id', 'species'], rows),
        test: formatCsv(
          ['id', 'bill'],
          rows.map(([id]) => [id ?? '', '1']),
        ),
      }),
    )
    expect(dataset.testRows).toBe(50_000)
    expect(dataset.publicRows).toBe(15_000)
  })
})

const LABELS = ['Adelie', 'Chinstrap', 'Gentoo']

const datasets = fc
  .record({
    targets: fc.array(fc.constantFrom(...LABELS), { minLength: 2, maxLength: 40 }),
    trainTargets: fc.array(fc.constantFrom(...LABELS, 'Macaroni'), { minLength: 1, maxLength: 20 }),
    publicShare: fc.double({ min: 0.1, max: 0.5, noNaN: true }),
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    reversed: fc.boolean(),
  })
  .map(({ targets, trainTargets, publicShare, seed, reversed }) => {
    const solutionRows = targets.map((target, row) => [`t${row}`, target])
    const testRows = solutionRows.map(([id]) => [id ?? '', '40'])
    return input(
      {
        train: formatCsv(
          ['id', 'species'],
          trainTargets.map((target, row) => [`a${row}`, target]),
        ),
        // The answer key need not be in the test file's order.
        test: formatCsv(['id', 'bill'], reversed ? [...testRows].reverse() : testRows),
        solution: formatCsv(['id', 'species'], solutionRows),
      },
      { publicShare, seed },
    )
  })

describe('validateDataset properties', () => {
  it('a valid dataset gives a complete key with both halves, the same every time', () => {
    fc.assert(
      fc.property(datasets, (given) => {
        const dataset = accepted(given)
        const solution = parseCsv(given.files.solution, { maxBytes: 1e6 })
        expect(solution.ok && solution.value.rows).toEqual(
          dataset.answerKey.map(([id, target]) => [id, target]),
        )
        expect(dataset.publicRows).toBeGreaterThan(0)
        expect(dataset.privateRows).toBeGreaterThan(0)
        expect(dataset.publicRows + dataset.privateRows).toBe(dataset.testRows)
        expect(accepted(given)).toEqual(dataset)
      }),
    )
  })

  it('the sample submission lists every test ID, in order, with a label of the competition', () => {
    fc.assert(
      fc.property(datasets, (given) => {
        const dataset = accepted(given)
        const sample = parseCsv(dataset.sampleSubmission, { maxBytes: 1e6 })
        const test = parseCsv(given.files.test, { maxBytes: 1e6 })
        if (!sample.ok || !test.ok) throw new Error('the sample or the test file did not parse')
        expect(sample.value.header).toEqual(['id', 'species'])
        expect(sample.value.rows.map(([id]) => id)).toEqual(test.value.rows.map(([id]) => id))
        for (const [, prediction] of sample.value.rows) expect(dataset.labels).toContain(prediction)
      }),
    )
  })
})
