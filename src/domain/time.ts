/**
 * Time rules. Every function takes the current time as an argument: actions,
 * the cron task and jobs read the clock and pass `now` in, so the rules can be
 * tested and replayed (docs/architecture.md, "Time"). Times are epoch
 * milliseconds.
 */

export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS

/** A new competition's deadline is at least this far ahead, and at most that far (spec F1). */
export const DEADLINE_MIN_LEAD_MS = HOUR_MS
export const DEADLINE_MAX_LEAD_MS = 90 * DAY_MS

/**
 * Why `deadline` cannot be the deadline of a competition created at `now`, as
 * a sentence to show, or undefined when it can.
 */
export function deadlineProblem(deadline: number, now: number): string | undefined {
  if (!Number.isFinite(deadline)) return 'The deadline is not a date.'
  if (deadline < now + DEADLINE_MIN_LEAD_MS) {
    return 'The deadline must be at least 1 hour from now.'
  }
  if (deadline > now + DEADLINE_MAX_LEAD_MS) {
    return 'The deadline must be within 90 days from now.'
  }
  return undefined
}

/**
 * The UTC calendar day of `now`, as `YYYY-MM-DD`: the day a submission counts
 * against. Computed from days since 1970-01-01 (Hinnant's civil-from-days),
 * because domain code does not use `Date`.
 */
export function utcDay(now: number): string {
  const days = Math.floor(now / DAY_MS) + 719_468
  const era = Math.floor(days / 146_097)
  const dayOfEra = days - era * 146_097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)
  const pad = (value: number, width: number) => String(value).padStart(width, '0')
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

/** When the daily submission count after `now` resets: the next 00:00 UTC (spec F2). */
export function nextUtcMidnight(now: number): number {
  return (Math.floor(now / DAY_MS) + 1) * DAY_MS
}

/** Submissions are accepted strictly before the deadline. */
export function acceptsSubmissions(deadline: number, now: number): boolean {
  return now < deadline
}
