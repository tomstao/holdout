import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  acceptsSubmissions,
  DAY_MS,
  DEADLINE_MAX_LEAD_MS,
  DEADLINE_MIN_LEAD_MS,
  deadlineChangeProblem,
  deadlineProblem,
  HOUR_MS,
  nextUtcMidnight,
  phaseAt,
  timeLeft,
  utcDay,
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

  it('takes another minimum where a test needs one, and names it', () => {
    expect(deadlineProblem(NOW + 30_000, NOW, 15_000)).toBeUndefined()
    expect(deadlineProblem(NOW + 10_000, NOW, 15_000)).toBe(
      'The deadline must be at least 15 s from now.',
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

describe('utcDay', () => {
  it('names the UTC day, whatever the time within it', () => {
    expect(utcDay(0)).toBe('1970-01-01')
    expect(utcDay(1_795_132_800_000 - 1)).toBe('2026-11-19')
    expect(utcDay(1_795_132_800_000)).toBe('2026-11-20')
    expect(utcDay(951_782_400_000)).toBe('2000-02-29')
    expect(utcDay(4_107_456_000_000)).toBe('2100-02-28')
    expect(utcDay(4_107_542_400_000)).toBe('2100-03-01')
  })

  it('agrees with the platform calendar on any day from 1970 to 2200', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 7_258_118_400_000 }), (now) => {
        // Only the test compares against Date; the domain code may not use it.
        // eslint-disable-next-line no-restricted-globals
        expect(utcDay(now)).toBe(new Date(now).toISOString().slice(0, 10))
      }),
      { numRuns: 2000 },
    )
  })
})

describe('nextUtcMidnight', () => {
  it('is the start of the next UTC day, even at midnight itself', () => {
    expect(nextUtcMidnight(1_795_046_400_000)).toBe(1_795_132_800_000)
    expect(nextUtcMidnight(1_795_132_800_000 - 1)).toBe(1_795_132_800_000)
    expect(nextUtcMidnight(1_795_132_800_000)).toBe(1_795_132_800_000 + DAY_MS)
  })
})

describe('acceptsSubmissions', () => {
  it('accepts until the deadline, not at it', () => {
    expect(acceptsSubmissions(NOW, NOW - 1)).toBe(true)
    expect(acceptsSubmissions(NOW, NOW)).toBe(false)
    expect(acceptsSubmissions(NOW, NOW + 1)).toBe(false)
  })
})

describe('timeLeft', () => {
  it('names the two largest units, rounded down', () => {
    expect(timeLeft(2 * DAY_MS + 4 * HOUR_MS + 59 * 60_000)).toBe('2 d 4 h')
    expect(timeLeft(3 * HOUR_MS + 12 * 60_000 + 59_999)).toBe('3 h 12 min')
    expect(timeLeft(12 * 60_000 + 40_500)).toBe('12 min 40 s')
    expect(timeLeft(9_999)).toBe('9 s')
    expect(timeLeft(0)).toBe('0 s')
    expect(timeLeft(-5000)).toBe('0 s')
  })
})

describe('phaseAt', () => {
  it('is open until the deadline, closing until the record says closed', () => {
    expect(phaseAt('open', NOW, NOW - 1)).toBe('open')
    expect(phaseAt('open', NOW, NOW)).toBe('closing')
    expect(phaseAt('closing', NOW, NOW - 1)).toBe('closing')
    expect(phaseAt('closing', NOW, NOW + 60_000)).toBe('closing')
    expect(phaseAt('closed', NOW, NOW - 1)).toBe('closed')
    expect(phaseAt('closed', NOW, NOW + 1)).toBe('closed')
  })
})

describe('timeLeft to the minute', () => {
  it('drops the seconds until the last minute', () => {
    expect(timeLeft(12 * 60_000 + 40_000, 'minute')).toBe('12 min')
    expect(timeLeft(60_000, 'minute')).toBe('1 min')
    expect(timeLeft(59_999, 'minute')).toBe('59 s')
    expect(timeLeft(0, 'minute')).toBe('0 s')
  })

  it('reads the same as the precise form from an hour up', () => {
    for (const ms of [HOUR_MS, 3 * HOUR_MS + 12 * 60_000 + 5_000, 2 * DAY_MS + 4 * HOUR_MS]) {
      expect(timeLeft(ms, 'minute')).toBe(timeLeft(ms))
    }
  })
})

describe('deadlineChangeProblem', () => {
  const CURRENT = NOW + 30 * 60_000

  it('lets a deadline stay where it is, even when it is minutes away', () => {
    expect(deadlineChangeProblem(CURRENT, CURRENT, NOW)).toBeUndefined()
    expect(deadlineChangeProblem(CURRENT, CURRENT, CURRENT - 1)).toBeUndefined()
  })

  it('lets a deadline move later, up to 90 days from now', () => {
    expect(deadlineChangeProblem(CURRENT, CURRENT + 1, NOW)).toBeUndefined()
    expect(deadlineChangeProblem(CURRENT, NOW + 90 * DAY_MS, NOW)).toBeUndefined()
    expect(deadlineChangeProblem(CURRENT, NOW + 90 * DAY_MS + 1, NOW)).toBe(
      'The deadline must be within 90 days from now.',
    )
  })

  it('never lets a deadline move earlier', () => {
    expect(deadlineChangeProblem(CURRENT, CURRENT - 1, NOW)).toBe(
      'The deadline can only move later.',
    )
    expect(deadlineChangeProblem(NOW + 30 * DAY_MS, NOW + 29 * DAY_MS, NOW)).toBe(
      'The deadline can only move later.',
    )
  })

  it('refuses what is not a time', () => {
    expect(deadlineChangeProblem(CURRENT, Number.NaN, NOW)).toBe('The deadline is not a date.')
    expect(deadlineChangeProblem(CURRENT, Number.POSITIVE_INFINITY, NOW)).toBe(
      'The deadline is not a date.',
    )
  })
})
