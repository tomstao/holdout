import { describe, expect, it } from 'vitest'
import { createCompetition } from './competitions'

const VALID = {
  title: 'Palmer Penguins',
  summary: 'Predict the species of a penguin.',
  taskType: 'classification',
  metric: 'accuracy',
  idColumn: 'id',
  targetColumn: 'species',
  deadline: 1_795_100_000_000,
  files: {
    train: { name: 'train.csv', csv: 'id,species\n1,a\n' },
    test: { name: 'test.csv', csv: 'id\n2\n' },
    solution: { name: 'solution.csv', csv: 'id,species\n2,a\n' },
  },
}

function messages(change: Record<string, unknown>): Record<string, string> {
  const result = createCompetition.input.safeParse({ ...VALID, ...change })
  if (result.success) return {}
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  )
}

describe('createCompetition input', () => {
  it('fills in the defaults and trims the title and the summary', () => {
    const parsed = createCompetition.input.parse({ ...VALID, title: '  Palmer Penguins  ' })
    expect(parsed).toMatchObject({
      title: 'Palmer Penguins',
      description: '',
      dailyLimit: 5,
      scoreDecimals: 4,
      publicShare: 0.3,
    })
  })

  it('says what to change, in words a form can show under the field', () => {
    expect(
      messages({
        title: 'ab',
        summary: 'short',
        description: 'x'.repeat(5001),
        idColumn: '',
        deadline: Number.NaN,
        dailyLimit: Number.NaN,
        scoreDecimals: 9,
        publicShare: 0.9,
      }),
    ).toEqual({
      title: 'Use at least 3 characters.',
      summary: 'Use at least 10 characters.',
      description: 'Use at most 5,000 characters.',
      idColumn: 'Choose the ID column.',
      deadline: 'Choose a date and time.',
      dailyLimit: 'Enter a whole number from 1 to 20.',
      scoreDecimals: 'Enter a whole number from 2 to 6.',
      publicShare: 'Enter a share from 10 to 50%.',
    })
    expect(messages({ dailyLimit: 2.5 })).toEqual({
      dailyLimit: 'Enter a whole number from 1 to 20.',
    })
    expect(messages({ title: 'x'.repeat(81) })).toEqual({ title: 'Use at most 80 characters.' })
  })

  it('refuses a metric of the other task type and a target that is the ID', () => {
    expect(messages({ metric: 'rmse' })).toEqual({
      metric: 'This metric does not fit the task type.',
    })
    expect(messages({ targetColumn: 'id' })).toEqual({
      targetColumn: 'The target column must differ from the ID column.',
    })
  })

  it('refuses a file far over its limit before the domain measures it', () => {
    const huge = { name: 'solution.csv', csv: 'x'.repeat(1_500_001) }
    expect(Object.keys(messages({ files: { ...VALID.files, solution: huge } }))).toEqual([
      'files.solution.csv',
    ])
  })

  it('answers with the new id only', () => {
    expect(createCompetition.output.parse({ competitionId: 'c1', rows: [] })).toEqual({
      competitionId: 'c1',
    })
  })
})
