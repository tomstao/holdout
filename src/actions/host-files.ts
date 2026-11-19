/**
 * The real things createCompetition needs from the platform: the host's
 * private file folder, the clock, randomness and ids. Kept apart from the
 * handler so its unit test never loads the Worker SDK.
 */
import { appFiles } from 'deepspace/worker'
import type { CreateCompetitionDeps } from './create-competition'

export const createCompetitionDeps: CreateCompetitionDeps = {
  hostFiles(env, hostId) {
    // `self` scope: only the host and this Worker can read or write there
    // (docs/decisions/0011-datasets-in-host-files-behind-a-route.md).
    const files = appFiles(env, { scope: 'self', userId: hostId })
    return {
      async put(key, name, text) {
        const stored = await files.upload(new Blob([text], { type: 'text/csv' }), { key, name })
        return stored.key
      },
      async remove(storedKey) {
        await files.delete(storedKey)
      },
    }
  },
  now: () => Date.now(),
  seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
  newId: () => crypto.randomUUID(),
}
