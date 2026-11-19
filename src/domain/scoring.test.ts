import { describe, expect, it } from 'vitest'
import type { AnswerKeyRow } from './dataset'
import { accuracy, macroF1, mae, rmse } from './metrics'
import { scoreSubmission } from './scoring'

const KEY: AnswerKeyRow[] = [
  ['t1', 'a', 'public'],
  ['t2', 'b', 'public'],
  ['t3', 'a', 'private'],
  ['t4', 'b', 'private'],
  ['t5', 'b', 'private'],
  ['t6', 'a', 'ignored'],
]

describe('scoreSubmission', () => {
  it('scores the public and the private rows apart, ignoring ignored rows', () => {
    // Public: right, wrong. Private: right, right, wrong. The ignored row is wrong.
    const predicted = ['a', 'a', 'a', 'b', 'a', 'b']
    expect(scoreSubmission('accuracy', KEY, predicted)).toEqual({
      publicScore: 0.5,
      privateScore: 2 / 3,
    })
    expect(scoreSubmission('macro_f1', KEY, predicted)).toEqual({
      publicScore: macroF1(['a', 'b'], ['a', 'a']),
      privateScore: macroF1(['a', 'b', 'b'], ['a', 'b', 'a']),
    })
  })

  it('scores regression on numbers', () => {
    const key: AnswerKeyRow[] = [
      ['t1', '10', 'public'],
      ['t2', '20', 'private'],
      ['t3', '1e1', 'private'],
    ]
    const predicted = ['12', '20', '13']
    expect(scoreSubmission('rmse', key, predicted)).toEqual({
      publicScore: rmse([10], [12]),
      privateScore: rmse([20, 10], [20, 13]),
    })
    expect(scoreSubmission('mae', key, predicted)).toEqual({
      publicScore: mae([10], [12]),
      privateScore: mae([20, 10], [20, 13]),
    })
  })

  it('gives a perfect file the best score on both halves', () => {
    const perfect = KEY.map(([, target]) => target)
    expect(scoreSubmission('accuracy', KEY, perfect)).toEqual({ publicScore: 1, privateScore: 1 })
    expect(accuracy(['a'], ['a'])).toBe(1)
  })

  it('refuses predictions that are not lined up with the key', () => {
    expect(() => scoreSubmission('accuracy', KEY, ['a'])).toThrow(RangeError)
  })
})
