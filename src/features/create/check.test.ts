import { describe, expect, it } from 'vitest'
import {
  checkDataset,
  columnChoices,
  groupByFile,
  issuePlace,
  lookAtFile,
  tooLargeToRead,
} from './check'

const train = { name: 'train.csv', text: 'id,species\na1,Adelie\na2,Gentoo\n' }
const test = { name: 'test.csv', text: 'id,bill\nt1,40\nt2,46\n' }
const solution = { name: 'solution.csv', text: 'id,species\nt1,Adelie\nt2,Gentoo\n' }
const settings = {
  taskType: 'classification',
  idColumn: 'id',
  targetColumn: 'species',
  publicShare: 0.3,
} as const

describe('lookAtFile', () => {
  it('describes a readable file', () => {
    expect(lookAtFile('train', train)).toEqual({
      ok: true,
      header: ['id', 'species'],
      rows: 2,
      summary: '2 rows, 2 columns',
    })
    expect(lookAtFile('test', { name: 't.csv', text: 'id\n1\n' })).toMatchObject({
      summary: '1 row, 1 column',
    })
  })

  it('reports why a file cannot be read, under that file', () => {
    expect(lookAtFile('solution', { name: 's.csv', text: 'id,species\nt1,"Adelie\n' })).toEqual({
      ok: false,
      issues: [
        { path: ['solution', 'row 2'], message: 'Field 2 opens a quote that is never closed.' },
      ],
    })
  })

  it('keeps the count of problems left out', () => {
    const look = lookAtFile('test', { name: 't.csv', text: 'id,bill\n' + 'x\n'.repeat(25) })
    expect(look.ok).toBe(false)
    if (!look.ok) {
      expect(look.issues).toHaveLength(21)
      expect(look.issues[20]).toEqual({
        path: ['test'],
        message: 'And 5 more problems in this file.',
      })
    }
  })
})

describe('tooLargeToRead', () => {
  it('skips reading a file over twice its limit', () => {
    expect(tooLargeToRead('solution', 3_000_000)).toBeUndefined()
    expect(tooLargeToRead('solution', 3_000_001)).toEqual({
      path: ['solution'],
      message: 'The file is 3.01 MB; the limit is 1.5 MB.',
    })
    expect(tooLargeToRead('train', 9_000_000)).toBeUndefined()
  })
})

describe('columnChoices', () => {
  it('offers every named column except Usage', () => {
    expect(columnChoices(['id', 'species', 'Usage'])).toEqual(['id', 'species'])
    expect(columnChoices(['', 'id', ' usage ', 'y'])).toEqual(['id', 'y'])
  })
})

describe('checkDataset', () => {
  it('waits until the three files and both columns are there', () => {
    expect(checkDataset(settings, { train, test })).toEqual({ state: 'incomplete' })
    expect(checkDataset({ ...settings, targetColumn: '' }, { train, test, solution })).toEqual({
      state: 'incomplete',
    })
  })

  it('accepts a valid dataset and counts its rows', () => {
    const check = checkDataset(settings, { train, test, solution })
    expect(check.state).toBe('ok')
    if (check.state === 'ok') {
      expect(check.dataset).toMatchObject({ testRows: 2, publicRows: 1, privateRows: 1 })
    }
  })

  it('sorts the problems under their files', () => {
    const check = checkDataset(settings, {
      train,
      test,
      solution: { name: 's.csv', text: 'id,species\nt1,Adelie\nt9,\n' },
    })
    expect(check).toEqual({
      state: 'problems',
      issues: {
        train: [],
        test: [{ path: ['test', 'row 3', 'id'], message: 'The ID "t2" is not in solution.csv.' }],
        solution: [
          { path: ['solution', 'row 3', 'species'], message: 'The target is empty.' },
          { path: ['solution', 'row 3', 'id'], message: 'The ID "t9" is not in test.csv.' },
        ],
      },
    })
  })
})

describe('groupByFile and issuePlace', () => {
  it('leaves out issues that name no file', () => {
    expect(
      groupByFile([
        { path: ['title'], message: 'Too short.' },
        { path: ['train'], message: 'The file is empty.' },
        { message: 'No path.' },
      ]),
    ).toEqual({
      train: [{ path: ['train'], message: 'The file is empty.' }],
      test: [],
      solution: [],
    })
  })

  it('writes where in the file a problem is', () => {
    expect(issuePlace({ path: ['solution', 'row 12', 'species'], message: '' })).toBe(
      'Row 12, species',
    )
    expect(issuePlace({ path: ['test', 'id'], message: '' })).toBe('Id')
    expect(issuePlace({ path: ['train'], message: '' })).toBe('')
    expect(issuePlace({ message: '' })).toBe('')
  })
})
