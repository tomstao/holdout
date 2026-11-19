import { describe, expect, it } from 'vitest'
import type { DatasetRejected } from '../domain/dataset'
import { datasetIssues, fileIssues, issuePlace } from './file-issues'

const rejected = (
  issues: DatasetRejected['issues'],
  omittedByFile: Partial<DatasetRejected['omittedByFile']> = {},
): DatasetRejected => {
  const byFile = { train: 0, test: 0, solution: 0, ...omittedByFile }
  return {
    ok: false,
    issues,
    omitted: byFile.train + byFile.test + byFile.solution,
    omittedByFile: byFile,
  }
}

describe('datasetIssues', () => {
  it('puts the file, the row and the column into the path', () => {
    expect(
      datasetIssues(
        rejected([
          { file: 'solution', row: 12, column: 'species', message: 'The target is empty.' },
          { file: 'train', row: 1, message: 'The first row is empty.' },
          { file: 'test', column: 'id', message: 'No such column.' },
          { file: 'test', message: 'The file is empty.' },
        ]),
      ),
    ).toEqual([
      { path: ['solution', 'row 12', 'species'], message: 'The target is empty.' },
      { path: ['train', 'row 1'], message: 'The first row is empty.' },
      { path: ['test', 'id'], message: 'No such column.' },
      { path: ['test'], message: 'The file is empty.' },
    ])
  })

  it('adds the count of problems left out, per file', () => {
    expect(
      datasetIssues(
        rejected([{ file: 'train', row: 2, message: 'Bad.' }], { train: 1234, solution: 1 }),
      ),
    ).toEqual([
      { path: ['train', 'row 2'], message: 'Bad.' },
      { path: ['train'], message: 'And 1,234 more problems in this file.' },
      { path: ['solution'], message: 'And 1 more problem in this file.' },
    ])
  })

  it('keeps a problem that names no file', () => {
    expect(datasetIssues(rejected([{ message: 'Something is wrong.' }]))).toEqual([
      { path: [], message: 'Something is wrong.' },
    ])
  })
})

describe('fileIssues', () => {
  it('puts the row and the column into the path, and counts what was left out', () => {
    expect(
      fileIssues({
        ok: false,
        issues: [
          { row: 4, column: 'species', message: 'Bad label.' },
          { column: 'id', message: 'Missing ID.' },
          { message: 'Too short.' },
        ],
        omitted: 3,
      }),
    ).toEqual([
      { path: ['row 4', 'species'], message: 'Bad label.' },
      { path: ['id'], message: 'Missing ID.' },
      { path: [], message: 'Too short.' },
      { path: [], message: 'And 3 more problems in this file.' },
    ])
    expect(fileIssues({ ok: false, issues: [{ message: 'x' }], omitted: 1 })[1]?.message).toBe(
      'And 1 more problem in this file.',
    )
  })
})

describe('issuePlace', () => {
  it('writes where in the file a problem is, without the file itself', () => {
    expect(issuePlace({ path: ['solution', 'row 12', 'species'], message: '' })).toBe(
      'Row 12, species',
    )
    expect(issuePlace({ path: ['row 3', 'id'], message: '' })).toBe('Row 3, id')
    expect(issuePlace({ path: ['test', 'id'], message: '' })).toBe('Id')
    expect(issuePlace({ path: ['train'], message: '' })).toBe('')
    expect(issuePlace({ path: [], message: '' })).toBe('')
    expect(issuePlace({ message: '' })).toBe('')
  })
})
