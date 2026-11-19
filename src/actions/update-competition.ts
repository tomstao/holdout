/**
 * updateCompetition: the host changes a competition's title, summary and
 * description, or moves its deadline later (spec F5). Files, task, metric
 * and split are fixed once created.
 *
 * The room cannot make "check, then write" one step. The check is that the
 * competition is open and before its deadline; the write is a few
 * milliseconds later. Should the cron task mark the competition `closing`
 * in between and the write then move the deadline later, the close job finds
 * a competition that is not due and opens it again (src/server/close.ts).
 */
import { actionContracts } from '../contracts/actions'
import { fail, ok } from '../contracts/result'
import { acceptsSubmissions, deadlineChangeProblem } from '../domain/time'
import { implement } from './implement'
import { typedRecords } from './records'

export interface UpdateCompetitionDeps {
  now(): number
}

export function makeUpdateCompetition(deps: UpdateCompetitionDeps) {
  return implement(actionContracts.updateCompetition, async ({ input, userId, tools }) => {
    const records = typedRecords(tools)
    const now = deps.now()

    const found = await records.get('competitions', input.competitionId)
    if (!found.success) return fail('not_found', 'This competition does not exist.')
    const competition = found.data.record.data
    if (competition.hostId !== userId) {
      return fail('forbidden', 'Only the host can edit this competition.')
    }
    if (competition.status !== 'open' || !acceptsSubmissions(competition.deadline, now)) {
      return fail('closed', 'This competition has closed. It can no longer be edited.')
    }

    const problem = deadlineChangeProblem(competition.deadline, input.deadline, now)
    if (problem) {
      return fail('invalid_input', 'The deadline is not valid.', [
        { path: ['deadline'], message: problem },
      ])
    }

    const saved = await records.update('competitions', input.competitionId, {
      title: input.title,
      summary: input.summary,
      description: input.description,
      deadline: input.deadline,
    })
    if (!saved.success) {
      console.error(`[updateCompetition] failed for ${input.competitionId}: ${saved.error}`)
      return fail('internal', 'We could not save the changes. Try again.')
    }
    return ok({ competitionId: input.competitionId, deadline: input.deadline })
  })
}
