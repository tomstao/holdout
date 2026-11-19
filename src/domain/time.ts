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
