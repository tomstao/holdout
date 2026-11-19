import { describe, expect, it } from 'vitest'
import { issueLog, MAX_ISSUES, ok, reject } from './result'

describe('domain results', () => {
  it('wraps a value', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 })
  })

  it('rejects with one problem', () => {
    expect(reject({ row: 2, column: 'id', message: 'This ID is empty.' })).toEqual({
      ok: false,
      issues: [{ row: 2, column: 'id', message: 'This ID is empty.' }],
      omitted: 0,
    })
  })
})

describe('issueLog', () => {
  it('keeps the first problems up to the limit and counts the rest', () => {
    const log = issueLog(2)
    expect(log.count).toBe(0)
    for (const row of [2, 3, 4, 5]) log.add({ row, message: 'Bad.' })
    expect(log.count).toBe(4)
    expect(log.rejection()).toEqual({
      ok: false,
      issues: [
        { row: 2, message: 'Bad.' },
        { row: 3, message: 'Bad.' },
      ],
      omitted: 2,
    })
  })

  it('reports 20 problems per file by default', () => {
    const log = issueLog()
    for (let row = 0; row < MAX_ISSUES + 5; row++) log.add({ row, message: 'Bad.' })
    const rejected = log.rejection()
    expect(rejected.issues).toHaveLength(20)
    expect(rejected.omitted).toBe(5)
  })

  it('absorbs another rejection, tagging its problems and keeping its count', () => {
    const inner = issueLog(2)
    for (const row of [2, 3, 4, 5, 6]) inner.add({ row, message: 'Bad.' })
    const log = issueLog(3)
    log.add({ message: 'First.' })
    log.absorb(inner.rejection(), { file: 'train' })
    log.absorb(reject({ file: 'kept', message: 'Its own file wins.' }), { file: 'train' })
    expect(log.count).toBe(7)
    expect(log.rejection()).toEqual({
      ok: false,
      issues: [
        { message: 'First.' },
        { file: 'train', row: 2, message: 'Bad.' },
        { file: 'train', row: 3, message: 'Bad.' },
      ],
      omitted: 4,
    })
  })

  it('hands out a copy, so later problems do not change an earlier rejection', () => {
    const log = issueLog()
    log.add({ message: 'First.' })
    const rejected = log.rejection()
    log.add({ message: 'Second.' })
    expect(rejected.issues).toEqual([{ message: 'First.' }])
  })
})
