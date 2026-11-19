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
 * a sentence to show, or undefined when it can. `minLeadMs` is the spec's one
 * hour everywhere except in local tests, which need a competition that closes
 * while they watch.
 */
export function deadlineProblem(
  deadline: number,
  now: number,
  minLeadMs: number = DEADLINE_MIN_LEAD_MS,
): string | undefined {
  if (!Number.isFinite(deadline)) return 'The deadline is not a date.'
  if (deadline < now + minLeadMs) {
    return minLeadMs === DEADLINE_MIN_LEAD_MS
      ? 'The deadline must be at least 1 hour from now.'
      : `The deadline must be at least ${timeLeft(minLeadMs)} from now.`
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

/**
 * A time left, for people: `2 d 4 h`, `3 h 12 min`, `12 min 40 s`, `9 s`.
 * Rounded down, so it never promises more time than there is.
 */
export function timeLeft(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  if (minutes > 0) return `${minutes} min ${seconds % 60} s`
  return `${seconds} s`
}

/** Where a competition is, as a visitor is told. */
export type Phase = 'open' | 'closing' | 'closed'

/**
 * A competition is open until its deadline, then closing until the close job
 * has written the final standings and marked it closed. The record still says
 * `open` for up to a minute after the deadline; the clock decides.
 */
export function phaseAt(status: Phase, deadline: number, now: number): Phase {
  if (status === 'closed') return 'closed'
  return status === 'open' && acceptsSubmissions(deadline, now) ? 'open' : 'closing'
}
