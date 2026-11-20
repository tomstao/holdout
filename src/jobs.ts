/**
 * Background jobs, run by AppJobRoom (worker.ts), one at a time.
 *
 * One job type: close a competition (src/server/close.ts). It is enqueued by
 * the cron task only; the room refuses every client write (worker.ts). Its
 * payload and its result hold nothing private, because a member may read job
 * rows. That goes for the close-out email too: the result says what became of
 * it, never to whom it went.
 */
import { buildCronContext } from 'deepspace/worker'
import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker.js'
import { closeCompetition, type CloseJobDeps } from './server/close.js'
import { roomTools } from './server/room-tools.js'

export const CLOSE_JOB = 'close-competition'

/**
 * The close-out email's sender: `email/send`, billed to the app owner
 * (docs/decisions/0012-integrations-email-only.md). The platform sets the sender's
 * address itself.
 *
 * None where `ALLOW_DEBUG_ROUTES` is set, which `deepspace dev` and `deepspace test`
 * do and a deploy never does: a local run makes no paid call and mails nobody.
 */
function emailSender(env: Env): CloseJobDeps['sendEmail'] {
  if (env.ALLOW_DEBUG_ROUTES === 'true') return undefined
  const owner = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
  return async (message) => {
    await owner.integrations.call('email/send', {
      to: message.to,
      ...(message.bcc.length > 0 ? { bcc: message.bcc } : {}),
      reply_to: message.reply_to,
      subject: message.subject,
      text: message.text,
    })
  }
}

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
    {
      tools: roomTools(env),
      now: () => Date.now(),
      origin: `https://${env.APP_NAME}.app.space`,
      sendEmail: emailSender(env),
    },
  )
  if (result) console.info(`[close] ${payload.competitionId}: ${JSON.stringify(result)}`)
  return result
}
