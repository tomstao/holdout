import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  DEADLINE_MAX_LEAD_MS,
  DEADLINE_MIN_LEAD_MS,
  deadlineProblem,
  HOUR_MS,
} from './time'

const NOW = 1_795_000_000_000

describe('deadlineProblem', () => {
  it('accepts a deadline between one hour and 90 days ahead, bounds included', () => {
    expect(deadlineProblem(NOW + HOUR_MS, NOW)).toBeUndefined()
    expect(deadlineProblem(NOW + 7 * DAY_MS, NOW)).toBeUndefined()
    expect(deadlineProblem(NOW + 90 * DAY_MS, NOW)).toBeUndefined()
  })

  it('refuses a deadline in the past or less than an hour ahead', () => {
    const message = 'The deadline must be at least 1 hour from now.'
    expect(deadlineProblem(NOW - DAY_MS, NOW)).toBe(message)
    expect(deadlineProblem(NOW, NOW)).toBe(message)
    expect(deadlineProblem(NOW + HOUR_MS - 1, NOW)).toBe(message)
  })

  it('refuses a deadline more than 90 days ahead', () => {
    expect(deadlineProblem(NOW + 90 * DAY_MS + 1, NOW)).toBe(
      'The deadline must be within 90 days from now.',
    )
  })

  it('refuses a value that is not a time', () => {
    expect(deadlineProblem(Number.NaN, NOW)).toBe('The deadline is not a date.')
    expect(deadlineProblem(Number.POSITIVE_INFINITY, NOW)).toBe('The deadline is not a date.')
  })

  it('uses the limits of the spec', () => {
    expect(DEADLINE_MIN_LEAD_MS).toBe(3_600_000)
    expect(DEADLINE_MAX_LEAD_MS).toBe(7_776_000_000)
  })
})
