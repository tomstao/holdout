/**
 * submitPredictions: check a participant's file, score it, and record it
 * against their daily limit (spec F2).
 *
 * The daily limit is a claim on a numbered slot. The action counts the
 * caller's submissions today and creates the next slot; `uniqueOn` refuses
 * the create if a concurrent submission took that slot first, and the action
 * counts again once (docs/decisions/0008-daily-limit-with-uniqueon-slots.md).
 * A file that fails its checks is never stored and uses no slot.
 *
 * The private score is written second, to a closed collection, and never
 * returned. If it cannot be written the submission is removed again, so no
 * public score exists without its private one.
 */
import { actionContracts } from '../contracts/actions'
import type { CompetitionRecord } from '../contracts/competitions'
import { fileIssues } from '../contracts/file-issues'
import { fail, ok } from '../contracts/result'
import { validatePredictions } from '../domain/predictions'
import { scoreSubmission } from '../domain/scoring'
import { acceptsSubmissions, nextUtcMidnight, utcDay } from '../domain/time'
import { implement } from './implement'
import { typedRecords } from './records'
import { displayName, isUniqueConflict } from './shared'

export interface SubmitPredictionsDeps {
  now(): number
}

const NOT_FOUND = 'This competition does not exist.'

export function makeSubmitPredictions(deps: SubmitPredictionsDeps) {
  return implement(actionContracts.submitPredictions, async ({ input, userId, tools }) => {
    const records = typedRecords(tools)
    const now = deps.now()

    const found = await records.get('competitions', input.competitionId)
    if (!found.success) return fail('not_found', NOT_FOUND)
    const competition: CompetitionRecord = found.data.record.data
    if (competition.hostId === userId) {
      return fail('forbidden', 'You host this competition, so you cannot submit to it.')
    }
    if (competition.status !== 'open' || !acceptsSubmissions(competition.deadline, now)) {
      return fail('closed', 'This competition has closed. It no longer accepts submissions.')
    }

    const key = await records.get('answer_keys', input.competitionId)
    if (!key.success) {
      console.error(`[submitPredictions] no answer key for ${input.competitionId}`)
      return fail('internal', 'This competition cannot score submissions right now.')
    }
    const answerKey = key.data.record.data.rows

    const checked = validatePredictions(
      input.csv,
      {
        idColumn: competition.idColumn,
        targetColumn: competition.targetColumn,
        taskType: competition.taskType,
        labels: competition.labels,
        testRows: answerKey.length,
      },
      answerKey,
    )
    if (!checked.ok) {
      return fail(
        'invalid_file',
        'The file has problems. Fix them and try again; this did not use a submission.',
        fileIssues(checked),
      )
    }
    const { publicScore, privateScore } = scoreSubmission(
      competition.metric,
      answerKey,
      checked.value,
    )

    const day = utcDay(now)
    const resetsAt = nextUtcMidnight(now)
    const limitReached = () =>
      fail(
        'limit_reached',
        `You have used all ${competition.dailyLimit} submissions for today. The count resets at 00:00 UTC.`,
      )
    const nextSlot = async (): Promise<number> => {
      const today = await records.query('submissions', {
        where: { competitionId: input.competitionId, participantId: userId, utcDay: day },
      })
      if (!today.success) throw new Error(`submissions query: ${today.error}`)
      return today.data.records.length + 1
    }

    try {
      const participantName = await displayName(tools, userId, 'Participant')
      let submissionId: string | undefined
      let slot = 0
      for (let attempt = 0; attempt < 2 && submissionId === undefined; attempt++) {
        slot = await nextSlot()
        if (slot > competition.dailyLimit) return limitReached()
        const created = await records.create('submissions', {
          competitionId: input.competitionId,
          participantId: userId,
          participantName,
          fileName: input.fileName,
          utcDay: day,
          slot,
          publicScore,
          rowCount: answerKey.length,
        })
        if (created.success) submissionId = created.data.recordId
        else if (!isUniqueConflict(created)) throw new Error(`submissions: ${created.error}`)
      }
      if (submissionId === undefined) {
        return fail(
          'conflict',
          'Another submission of yours is being scored. Try again in a moment.',
        )
      }

      const saved = await records.create(
        'private_scores',
        { submissionId, competitionId: input.competitionId, participantId: userId, privateScore },
        submissionId,
      )
      if (!saved.success) {
        await records.remove('submissions', submissionId)
        throw new Error(`private_scores: ${saved.error}`)
      }

      return ok({ submissionId, publicScore, slot, dailyLimit: competition.dailyLimit, resetsAt })
    } catch (error) {
      console.error(
        `[submitPredictions] failed for ${input.competitionId}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return fail('internal', 'We could not record the submission. It did not count. Try again.')
    }
  })
}
