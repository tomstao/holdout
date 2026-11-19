/**
 * The real things the actions need from the platform: the host's private
 * file folder, the clock, randomness and ids. Kept apart from the handlers so
 * their unit tests never load the Worker SDK.
 */
import { appFiles } from 'deepspace/worker'
import { DEADLINE_MIN_LEAD_MS } from '../domain/time'
import type { CreateCompetitionDeps } from './create-competition'
import { isStorageBusy, withRetry, type RetryOptions } from './retry'
import type { SubmitPredictionsDeps } from './submit-predictions'

/**
 * Up to four attempts, about 1.5 s of waiting in all. The waits are spread
 * at random, so uploads that collided do not collide again in step.
 */
const WHEN_STORAGE_IS_BUSY: RetryOptions = {
  waits: [150, 400, 900],
  retryable: isStorageBusy,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms * (0.5 + Math.random()))),
  onRetry: (error, wait) => {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[files] ${reason} Trying again in about ${wait} ms.`)
  },
}

export const createCompetitionDeps: CreateCompetitionDeps = {
  hostFiles(env, hostId) {
    // `self` scope: only the host and this Worker can read or write there
    // (docs/decisions/0011-datasets-in-host-files-behind-a-route.md).
    const files = appFiles(env, { scope: 'self', userId: hostId })
    return {
      async put(key, name, text) {
        // The key is fixed, so a repeated upload writes the same object.
        const stored = await withRetry(
          () => files.upload(new Blob([text], { type: 'text/csv' }), { key, name }),
          WHEN_STORAGE_IS_BUSY,
        )
        return stored.key
      },
      async remove(storedKey) {
        await withRetry(() => files.delete(storedKey), WHEN_STORAGE_IS_BUSY)
      },
    }
  },
  now: () => Date.now(),
  // `deepspace dev` and `deepspace test` set ALLOW_DEBUG_ROUTES; a deploy never does.
  // There a spec may create a competition due in seconds, to watch it close.
  minDeadlineLeadMs: (env) => (env.ALLOW_DEBUG_ROUTES === 'true' ? 15_000 : DEADLINE_MIN_LEAD_MS),
  seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
  newId: () => crypto.randomUUID(),
}

export const submitPredictionsDeps: SubmitPredictionsDeps = { now: () => Date.now() }
