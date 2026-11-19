/**
 * Background jobs, run by AppJobRoom (worker.ts), one at a time.
 *
 * One job type: close a competition (src/server/close.ts). It is enqueued by
 * the cron task only; the room refuses every client write (worker.ts). Its
 * payload and its result hold nothing private, because members can read job
 * rows.
 */
import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker.js'
import { closeCompetition } from './server/close.js'
import { roomTools } from './server/room-tools.js'

export const CLOSE_JOB = 'close-competition'

export async function runJob(job: Job, context: JobContext, env: Env): Promise<unknown> {
  if (job.type !== CLOSE_JOB) throw new Error(`Unknown job type: ${job.type}`)
  const payload = job.payload as { competitionId?: unknown } | null
  if (typeof payload?.competitionId !== 'string') {
    throw new Error(`${CLOSE_JOB} needs a competitionId`)
  }
  const result = await closeCompetition(
    payload.competitionId,
    {
      resumeFrom: job.resumeFrom,
      progress: (value, message) => {
        context.progress(value, message)
      },
      continueWith: (state, afterMs) => {
        context.continue(state, afterMs === undefined ? undefined : { afterMs })
      },
    },
    { tools: roomTools(env), now: () => Date.now() },
  )
  if (result) console.info(`[close] ${payload.competitionId}: ${JSON.stringify(result)}`)
  return result
}
