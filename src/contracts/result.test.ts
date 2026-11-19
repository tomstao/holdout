import { describe, expect, it } from 'vitest'
import { fail, FAILURE_CODES, isFailureCode, ok } from './result'

describe('result helpers', () => {
  it('builds a success and a failure', () => {
    expect(ok({ n: 1 })).toEqual({ success: true, data: { n: 1 } })
    expect(fail('closed', 'This competition has closed.')).toEqual({
      success: false,
      code: 'closed',
      error: 'This competition has closed.',
    })
    expect(fail('invalid_file', 'Bad file.', [{ message: 'Empty.' }]).issues).toEqual([
      { message: 'Empty.' },
    ])
  })

  it('recognises only the declared failure codes', () => {
    for (const code of FAILURE_CODES) expect(isFailureCode(code)).toBe(true)
    expect(isFailureCode('teapot')).toBe(false)
    expect(isFailureCode(42)).toBe(false)
  })
})
