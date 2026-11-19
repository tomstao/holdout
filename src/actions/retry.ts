/**
 * Trying again when a failure is temporary.
 *
 * The platform's file storage keeps one usage counter per account and
 * updates it without a lock. When several uploads race for it, the losers
 * get a 503: "Storage is busy with other uploads. Retry shortly."
 * (docs/lessons.md). An upload to a fixed key is safe to repeat.
 */

export interface RetryOptions {
  /** The wait before each further attempt, in ms. One more attempt than there are waits. */
  waits: readonly number[]
  /** Whether this failure is worth another attempt. */
  retryable(error: unknown): boolean
  sleep(ms: number): Promise<void>
  /** Called before each wait, for the log. */
  onRetry?(error: unknown, wait: number): void
}

/** Runs `run`, again after each wait while it fails in a retryable way. The last failure is thrown. */
export async function withRetry<T>(run: () => Promise<T>, options: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      const wait = options.waits[attempt]
      if (wait === undefined || !options.retryable(error)) throw error
      options.onRetry?.(error, wait)
      await options.sleep(wait)
    }
  }
}

/** The file storage's "try again shortly": an error that carries HTTP status 503. */
export function isStorageBusy(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 503
}
