/**
 * Scheduled tasks, run by AppCronRoom (worker.ts) from a Durable Object alarm.
 *
 * One task: every minute, find the competitions whose deadline has passed and
 * start closing them (src/server/close.ts). A task can run off schedule,
 * so it does nothing for a competition that is not due.
 */
import { enqueueJob } from 'deepspace/worker'
import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker.js'
import { CLOSE_JOB } from './jobs.js'
import { CLOSE_MAX_ATTEMPTS, closeDueCompetitions } from './server/close.js'
import { roomTools } from './server/room-tools.js'

const CLOSE_DUE = 'close-due-competitions'

export const tasks: CronTask[] = [{ name: CLOSE_DUE, intervalMinutes: 1 }]

export async function runTask(name: string, env: Env): Promise<void> {
  if (name !== CLOSE_DUE) throw new Error(`Unknown cron task: ${name}`)
  const started = await closeDueCompetitions({
    tools: roomTools(env),
    now: () => Date.now(),
    // The payload is the id only: a job row is logged and may be read by members.
    enqueue: (competitionId) =>
      enqueueJob(
        env.JOB_ROOMS,
        `app:${env.DEEPSPACE_APP_ID}`,
        CLOSE_JOB,
        { competitionId },
        { maxAttempts: CLOSE_MAX_ATTEMPTS },
      ),
  })
  if (started.length > 0) console.info(`[close] enqueued ${started.join(', ')}`)
}
