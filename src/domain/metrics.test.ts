import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import fixtures from './metrics.fixtures.json'
import {
  accuracy,
  compareScores,
  macroF1,
  mae,
  METRIC_INFO,
  METRICS,
  metricsFor,
  rmse,
  TASK_TYPES,
} from './metrics'

/** Within 1e-12, relative for large values: scikit-learn's own result, not an approximation. */
function expectSame(actual: number, expected: number): void {
  const tolerance = 1e-12 * Math.max(1, Math.abs(expected))
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance)
}

describe('against scikit-learn', () => {
  it('covers both task types with fixtures from a known version', () => {
    expect(fixtures.generatedBy).toBe('scripts/fixtures/metrics.py')
    expect(fixtures.versions['scikit-learn']).toMatch(/^\d+\.\d+/)
    expect(fixtures.classification.length).toBeGreaterThanOrEqual(10)
    expect(fixtures.regression.length).toBeGreaterThanOrEqual(10)
  })

  it.each(fixtures.classification)('accuracy and macro F1: $name', (fixture) => {
    expectSame(accuracy(fixture.truth, fixture.predicted), fixture.accuracy)
    expectSame(macroF1(fixture.truth, fixture.predicted), fixture.macro_f1)
  })

  it.each(fixtures.regression)('RMSE and MAE: $name', (fixture) => {
    expectSame(rmse(fixture.truth, fixture.predicted), fixture.rmse)
    expectSame(mae(fixture.truth, fixture.predicted), fixture.mae)
  })
})

describe('by hand', () => {
  it('accuracy is the share of exact matches', () => {
    expect(accuracy(['a', 'b', 'a', 'b'], ['a', 'b', 'b', 'b'])).toBe(0.75)
    expect(accuracy(['a'], ['A'])).toBe(0)
  })

  it('macro F1 averages the per-label scores, whatever the label counts', () => {
    // a: TP 2, FP 1, FN 0 -> 4/5. b: TP 1, FP 0, FN 1 -> 2/3.
    expect(macroF1(['a', 'a', 'b', 'b'], ['a', 'a', 'a', 'b'])).toBeCloseTo((4 / 5 + 2 / 3) / 2, 15)
  })

  it('macro F1 counts a label that is only predicted as a class scoring 0', () => {
    // Only "a" is ever true. a: TP 1, FN 1 -> 2/3. z: FP 1 -> 0.
    expect(macroF1(['a', 'a'], ['a', 'z'])).toBeCloseTo(2 / 3 / 2, 15)
    expect(accuracy(['a', 'a'], ['a', 'z'])).toBe(0.5)
  })

  it('a single class predicted perfectly scores 1', () => {
    expect(macroF1(['a', 'a', 'a'], ['a', 'a', 'a'])).toBe(1)
    expect(accuracy(['a', 'a', 'a'], ['a', 'a', 'a'])).toBe(1)
  })

  it('RMSE and MAE of a known pair', () => {
    expect(rmse([1, 2, 3], [1, 2, 6])).toBe(Math.sqrt(3))
    expect(mae([1, 2, 3], [1, 2, 6])).toBe(1)
    expect(rmse([5], [5])).toBe(0)
    expect(mae([-1], [1])).toBe(2)
  })

  it('RMSE does not lose small errors next to large ones', () => {
    // Summed naively in this order, the 1e16 swallows every 1.
    const truth = [1e8, ...Array.from({ length: 1000 }, () => 1)]
    const predicted = truth.map(() => 0)
    expect(rmse(truth, predicted)).toBe(Math.sqrt((1e16 + 1000) / 1001))
  })

  it('a prediction that is not a number gives NaN, not a score', () => {
    expect(rmse([1, 2], [1, Number.NaN])).toBeNaN()
    expect(mae([1, 2], [1, Number.NaN])).toBeNaN()
  })
})

describe('misuse', () => {
  it('refuses empty input', () => {
    expect(() => accuracy([], [])).toThrow(RangeError)
    expect(() => macroF1([], [])).toThrow('at least one row')
    expect(() => rmse([], [])).toThrow(RangeError)
    expect(() => mae([], [])).toThrow(RangeError)
  })

  it('refuses arrays of different lengths', () => {
    expect(() => accuracy(['a'], ['a', 'b'])).toThrow('got 2 for 1')
    expect(() => macroF1(['a', 'b'], ['a'])).toThrow(RangeError)
    expect(() => rmse([1], [])).toThrow(RangeError)
    expect(() => mae([1, 2], [1])).toThrow(RangeError)
  })
})

describe('metric catalogue', () => {
  it('describes every metric', () => {
    expect(Object.keys(METRIC_INFO).sort()).toEqual([...METRICS].sort())
    for (const metric of METRICS) {
      expect(METRIC_INFO[metric].name).not.toBe('')
      expect(TASK_TYPES).toContain(METRIC_INFO[metric].task)
    }
  })

  it('offers two metrics per task type', () => {
    expect(metricsFor('classification')).toEqual(['accuracy', 'macro_f1'])
    expect(metricsFor('regression')).toEqual(['rmse', 'mae'])
  })

  it('knows that scores rise and errors fall', () => {
    expect(METRIC_INFO.accuracy.higherIsBetter).toBe(true)
    expect(METRIC_INFO.macro_f1.higherIsBetter).toBe(true)
    expect(METRIC_INFO.rmse.higherIsBetter).toBe(false)
    expect(METRIC_INFO.mae.higherIsBetter).toBe(false)
  })

  it('orders scores best first', () => {
    expect([0.2, 0.9, 0.5].sort((a, b) => compareScores('accuracy', a, b))).toEqual([0.9, 0.5, 0.2])
    expect([0.2, 0.9, 0.5].sort((a, b) => compareScores('macro_f1', a, b))).toEqual([0.9, 0.5, 0.2])
    expect([0.2, 0.9, 0.5].sort((a, b) => compareScores('rmse', a, b))).toEqual([0.2, 0.5, 0.9])
    expect([0.2, 0.9, 0.5].sort((a, b) => compareScores('mae', a, b))).toEqual([0.2, 0.5, 0.9])
    expect(compareScores('accuracy', 0.5, 0.5)).toBe(0)
    expect(compareScores('rmse', 0.5, 0.5)).toBe(0)
  })
})

const label = fc.constantFrom('a', 'b', 'c', 'd')
const labelPairs = fc.array(fc.tuple(label, label), { minLength: 1, maxLength: 60 })
// Six decimals, as a file would hold. Smaller differences underflow to 0 when squared.
const value = fc.integer({ min: -1e12, max: 1e12 }).map((millionths) => millionths / 1e6)
const valuePairs = fc.array(fc.tuple(value, value), { minLength: 1, maxLength: 60 })

function unzip<T>(pairs: readonly (readonly [T, T])[]): [T[], T[]] {
  return [pairs.map(([truth]) => truth), pairs.map(([, predicted]) => predicted)]
}

describe('properties', () => {
  it('classification scores stay between 0 and 1, and are 1 exactly for a perfect file', () => {
    fc.assert(
      fc.property(labelPairs, (pairs) => {
        const [truth, predicted] = unzip(pairs)
        const perfect = pairs.every(([a, b]) => a === b)
        for (const score of [accuracy(truth, predicted), macroF1(truth, predicted)]) {
          expect(score).toBeGreaterThanOrEqual(0)
          expect(score).toBeLessThanOrEqual(1)
          expect(score === 1).toBe(perfect)
        }
      }),
    )
  })

  it('errors are never negative, and MAE never exceeds RMSE', () => {
    fc.assert(
      fc.property(valuePairs, (pairs) => {
        const [truth, predicted] = unzip(pairs)
        const absolute = mae(truth, predicted)
        const squared = rmse(truth, predicted)
        expect(absolute).toBeGreaterThanOrEqual(0)
        expect(squared).toBeGreaterThanOrEqual(absolute * (1 - 1e-12))
        expect(rmse(truth, truth)).toBe(0)
        expect(mae(truth, truth)).toBe(0)
      }),
    )
  })

  it('the order of the rows does not change a score', () => {
    fc.assert(
      fc.property(labelPairs, valuePairs, (labels, values) => {
        const [truth, predicted] = unzip(labels)
        const [backTruth, backPredicted] = unzip([...labels].reverse())
        expect(accuracy(backTruth, backPredicted)).toBe(accuracy(truth, predicted))
        expectSame(macroF1(backTruth, backPredicted), macroF1(truth, predicted))

        const [y, guess] = unzip(values)
        const [backY, backGuess] = unzip([...values].reverse())
        expectSame(rmse(backY, backGuess), rmse(y, guess))
        expectSame(mae(backY, backGuess), mae(y, guess))
      }),
    )
  })
})
