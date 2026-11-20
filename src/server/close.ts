/**
 * Closing a competition at its deadline, without anyone opening the page
 * (spec F4, docs/decisions/0009-close-with-cron-and-a-job.md).
 *
 *   - `closeDueCompetitions` is the cron task, every minute: it finds the
 *     competitions whose deadline has passed, marks them `closing` and
 *     enqueues one job each.
 *   - `closeCompetition` is that job: it computes the final standings from
 *     the private scores, writes them, and marks the competition `closed`.
 *
 * Both are safe to run early and twice. A task can run off schedule and a
 * job can be retried: the task and the job check the deadline themselves,
 * the standings have fixed record ids, and a closed competition is left
 * alone. A competition marked `closing` whose deadline has since moved later
 * is opened again.
 *
 * Plain functions over the record tools and a clock, so they can be tested
 * without a Worker. src/cron.ts and src/jobs.ts wire them to the rooms.
 */
import type { ActionTools } from 'deepspace/worker'
import { typedRecords } from '../actions/records'
import { closeEmails, type CloseEmail, type CloseEmailInput } from '../domain/close-email'
import { METRIC_INFO } from '../domain/metrics'
import { finalStandings, type FinalStanding, type PrivatelyScored } from '../domain/ranking'

/** A `closing` competition whose job has not finished after this long is enqueued again. */
export const STUCK_AFTER_MS = 10 * 60_000

/**
 * The job waits this long after the deadline before it reads the
 * submissions: one that passed the deadline check in the last instant may
 * still be writing its rows.
 */
export const CLOSE_GRACE_MS = 10_000

/** Standings written per job step, and how many of those writes are in flight at once. */
export const CLOSE_CHUNK = 40
export const CLOSE_PARALLEL = 20

/**
 * The attempts a close job is enqueued with. The job room counts every step
 * as an attempt, the ones that end in "continue" included, and stops
 * retrying a failure once the count reaches this number. A close of the 200
 * participants the spec is designed for takes six steps: one to wait out the
 * grace period and five of forty standings. Twelve leaves six for failures.
 * With three, the first failed write after the second step ended the job and
 * the competition waited for the ten-minute sweep.
 */
export const CLOSE_MAX_ATTEMPTS = 12

export interface CloseDeps {
  tools: ActionTools
  now(): number
}

/** What the job needs beyond the task: where the app is, and how to send mail. */
export interface CloseJobDeps extends CloseDeps {
  /** The app's public origin, for the link in the email. No trailing slash. */
  origin: string
  /**
   * Sends one close-out message. Left out where nothing may be sent (`deepspace dev`
   * and `deepspace test`): the messages are still built, and counted in the log.
   */
  sendEmail?: (message: CloseEmail) => Promise<void>
}

/**
 * What became of the close-out email: `sent`, `failed` (the send was refused; the
 * competition is closed all the same), `none` (the host has no address mail can
 * reach), or `off` (this run sends nothing).
 */
export type EmailOutcome = 'sent' | 'failed' | 'none' | 'off'

/** The cron task. Returns the ids of the competitions it enqueued. */
export async function closeDueCompetitions(
  deps: CloseDeps & { enqueue(competitionId: string): Promise<unknown> },
): Promise<string[]> {
  const records = typedRecords(deps.tools)
  const now = deps.now()

  const [open, closing] = await Promise.all([
    records.query('competitions', { where: { status: 'open' } }),
    records.query('competitions', { where: { status: 'closing' } }),
  ])
  if (!open.success) throw new Error(`competitions (open): ${open.error}`)
  if (!closing.success) throw new Error(`competitions (closing): ${closing.error}`)

  const due = [
    ...open.data.records.filter((record) => record.data.deadline <= now),
    ...closing.data.records.filter(
      (record) => (record.data.closingStartedAt ?? 0) <= now - STUCK_AFTER_MS,
    ),
  ]

  const started: string[] = []
  for (const { recordId } of due) {
    const marked = await records.update('competitions', recordId, {
      status: 'closing',
      closingStartedAt: now,
    })
    if (!marked.success) throw new Error(`competitions ${recordId}: ${marked.error}`)
    await deps.enqueue(recordId)
    started.push(recordId)
  }
  return started
}

/** What the job hands the room between steps. Nothing private: job rows are logged and listed. */
interface CloseProgress {
  next: number
}

function progressOf(value: unknown): CloseProgress {
  const next =
    typeof value === 'object' && value !== null && 'next' in value ? Number(value.next) : 0
  return { next: Number.isInteger(next) && next > 0 ? next : 0 }
}

/** The part of a job step this code uses (`Job.resumeFrom` and `JobContext`). */
export interface CloseStep {
  resumeFrom?: unknown
  progress(value: number, message?: string): void
  /** Save `state` and run again, at once or after `afterMs`. The step must return after it. */
  continueWith(state: CloseProgress, afterMs?: number): void
}

/** The job's result. Counts only: it is logged, and a job row may be read by members. */
export type CloseResult =
  | { status: 'closed'; participants: number; submissions: number; email: EmailOutcome }
  | { status: 'skipped'; reason: 'not_found' | 'already_closed' | 'not_due' | 'reopened' }

/** One step of the close job. Returns nothing when it asked to continue. */
export async function closeCompetition(
  competitionId: string,
  step: CloseStep,
  deps: CloseJobDeps,
): Promise<CloseResult | undefined> {
  const records = typedRecords(deps.tools)
  const now = deps.now()

  const found = await records.get('competitions', competitionId)
  if (!found.success) return { status: 'skipped', reason: 'not_found' }
  const competition = found.data.record.data
  if (competition.status === 'closed') return { status: 'skipped', reason: 'already_closed' }
  if (now < competition.deadline) {
    if (competition.status !== 'closing') return { status: 'skipped', reason: 'not_due' }
    // The host moved the deadline later in the instant the cron task marked the
    // competition (src/actions/update-competition.ts). It is not over: open it again.
    const reopened = await records.update('competitions', competitionId, { status: 'open' })
    if (!reopened.success) throw new Error(`competitions ${competitionId}: ${reopened.error}`)
    return { status: 'skipped', reason: 'reopened' }
  }

  const { next } = progressOf(step.resumeFrom)
  const settledAt = competition.deadline + CLOSE_GRACE_MS
  if (now < settledAt) {
    step.continueWith({ next }, settledAt - now)
    return undefined
  }

  const [submissions, privateScores] = await Promise.all([
    records.query('submissions', { where: { competitionId } }),
    records.query('private_scores', { where: { competitionId } }),
  ])
  if (!submissions.success) throw new Error(`submissions: ${submissions.error}`)
  if (!privateScores.success) throw new Error(`private_scores: ${privateScores.error}`)

  const privateScoreOf = new Map(
    privateScores.data.records.map((record) => [
      record.data.submissionId,
      record.data.privateScore,
    ]),
  )
  // A submission without its private score cannot count; the submit action removes such rows.
  const scored = submissions.data.records.flatMap((record): PrivatelyScored[] => {
    const privateScore = privateScoreOf.get(record.recordId)
    if (privateScore === undefined) return []
    return [
      {
        submissionId: record.recordId,
        participantId: record.data.participantId,
        participantName: record.data.participantName,
        publicScore: record.data.publicScore,
        submittedAt: Date.parse(record.createdAt),
        privateScore,
      },
    ]
  })
  // After the deadline and the grace period the rows no longer change, so
  // every step computes the same standings.
  const standings = finalStandings(competition.metric, scored)

  const end = Math.min(standings.length, next + CLOSE_CHUNK)
  for (let from = next; from < end; from += CLOSE_PARALLEL) {
    const written = await Promise.all(
      standings
        .slice(from, Math.min(end, from + CLOSE_PARALLEL))
        .map((standing) => writeStanding(records, competitionId, standing)),
    )
    for (const result of written) {
      if (!result.success) throw new Error(`final_standings: ${result.error}`)
    }
  }

  if (end < standings.length) {
    step.progress(end / standings.length, `${end} of ${standings.length} standings`)
    step.continueWith({ next: end })
    return undefined
  }

  const closed = await records.update('competitions', competitionId, {
    status: 'closed',
    closedAt: now,
  })
  if (!closed.success) throw new Error(`competitions ${competitionId}: ${closed.error}`)

  // Only the step that closed the competition sends the email, and only after the
  // write above succeeded. A retried or repeated job finds it closed and returns
  // early, so nobody gets the email twice. The price: a step that dies right here
  // sends none, and the page shows the results either way.
  const email = await sendCloseEmail(
    {
      title: competition.title,
      url: `${deps.origin}/c/${competitionId}`,
      hostName: competition.hostName,
      metricName: METRIC_INFO[competition.metric].name,
      scoreDecimals: competition.scoreDecimals,
      standings,
    },
    competitionId,
    competition.hostId,
    deps,
  )
  return { status: 'closed', participants: standings.length, submissions: scored.length, email }
}

/** Addresses in a provider's error are not for the log. */
const withoutAddresses = (text: string) => text.replace(/[^\s@<>"']+@[^\s@<>"']+/g, '<address>')

/**
 * Build and send the close-out email. Never throws: the competition is closed, and a
 * failed job would be retried into a competition that needs nothing more. The
 * addresses go from the `users` rows to the sender and nowhere else, not into the
 * job's result and not into the log.
 */
async function sendCloseEmail(
  content: Omit<CloseEmailInput, 'hostEmail' | 'participantEmails' | 'standings'> & {
    standings: readonly FinalStanding[]
  },
  competitionId: string,
  hostId: string,
  deps: CloseJobDeps,
): Promise<EmailOutcome> {
  let sent = 0
  try {
    const emailOf = async (userId: string) => {
      const user = await deps.tools.get<{ email?: string }>('users', userId)
      return user.success ? user.data.record.data.email : undefined
    }
    const participantEmails: (string | undefined)[] = []
    const ids = content.standings.map((standing) => standing.participantId)
    for (let from = 0; from < ids.length; from += CLOSE_PARALLEL) {
      participantEmails.push(
        ...(await Promise.all(ids.slice(from, from + CLOSE_PARALLEL).map(emailOf))),
      )
    }
    const messages = closeEmails({
      ...content,
      hostEmail: await emailOf(hostId),
      participantEmails,
    })
    if (messages.length === 0) return 'none'

    const recipients = messages.reduce((count, message) => count + message.bcc.length, 1)
    if (!deps.sendEmail) {
      console.info(
        `[close] ${competitionId}: email off here; ${messages.length} message(s) for ${recipients} recipient(s) not sent`,
      )
      return 'off'
    }
    for (const message of messages) {
      await deps.sendEmail(message)
      sent += 1
    }
    console.info(
      `[close] ${competitionId}: emailed ${recipients} recipient(s) in ${sent} message(s)`,
    )
    return 'sent'
  } catch (error) {
    const reason = withoutAddresses(error instanceof Error ? error.message : String(error))
    console.error(`[close] ${competitionId}: email failed after ${sent} message(s): ${reason}`)
    return 'failed'
  }
}

function writeStanding(
  records: ReturnType<typeof typedRecords>,
  competitionId: string,
  standing: FinalStanding,
) {
  // A fixed id: a retried or repeated job overwrites the same row.
  return records.create(
    'final_standings',
    { competitionId, ...standing },
    `${competitionId}:${standing.participantId}`,
  )
}
