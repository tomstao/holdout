/**
 * createCompetition: check the host's three files, store the datasets in the
 * host's private folder and write the answer key and the competition.
 *
 * Any signed-in user may call it; the caller becomes the host. Identity comes
 * from the verified `userId` only.
 *
 * Order matters. The competition record is written last, so a failure part
 * way leaves nothing a visitor can see, and what was already stored is removed
 * again (docs/architecture.md, "Create").
 */
import type { Env } from '../../worker'
import { actionContracts } from '../contracts/actions'
import { datasetIssues } from '../contracts/file-issues'
import { fail, ok } from '../contracts/result'
import { utf8ByteLength } from '../domain/csv'
import { validateDataset } from '../domain/dataset'
import { deadlineProblem } from '../domain/time'
import { implement } from './implement'
import { typedRecords } from './records'
import { displayName } from './shared'

/** The host's private file folder (`self` scope), as the Worker uses it. */
export interface HostFiles {
  /** Store `text` at `key` inside the folder; returns the stored key `remove` and downloads take. */
  put(key: string, name: string, text: string): Promise<string>
  remove(storedKey: string): Promise<void>
}

/** What the handler takes from the outside world, so a test can supply it. */
export interface CreateCompetitionDeps {
  hostFiles(env: Env, hostId: string): HostFiles
  now(): number
  /** The shortest time a deadline may lie ahead: the spec's hour, or seconds in a local test. */
  minDeadlineLeadMs(env: Env): number
  /** An unpredictable 32-bit seed for the public/private split (src/domain/split.ts). */
  seed(): number
  newId(): string
}

const SAMPLE_NAME = 'sample_submission.csv'

export function makeCreateCompetition(deps: CreateCompetitionDeps) {
  return implement(actionContracts.createCompetition, async ({ input, userId, tools, env }) => {
    const late = deadlineProblem(input.deadline, deps.now(), deps.minDeadlineLeadMs(env))
    if (late) {
      return fail('invalid_input', 'The deadline is not valid.', [
        { path: ['deadline'], message: late },
      ])
    }

    const checked = validateDataset({
      taskType: input.taskType,
      idColumn: input.idColumn,
      targetColumn: input.targetColumn,
      publicShare: input.publicShare,
      seed: deps.seed(),
      files: {
        train: input.files.train.csv,
        test: input.files.test.csv,
        solution: input.files.solution.csv,
      },
    })
    if (!checked.ok) {
      return fail(
        'invalid_file',
        'The files have problems. Fix them and try again.',
        datasetIssues(checked),
      )
    }
    const dataset = checked.value

    const records = typedRecords(tools)
    const files = deps.hostFiles(env, userId)
    const competitionId = deps.newId()
    const uploads = [
      { kind: 'train', name: input.files.train.name, text: input.files.train.csv },
      { kind: 'test', name: input.files.test.name, text: input.files.test.csv },
      { kind: 'sample', name: SAMPLE_NAME, text: dataset.sampleSubmission },
    ] as const

    const stored: string[] = []
    let keySaved = false
    const undo = async (): Promise<void> => {
      if (keySaved) await records.remove('answer_keys', competitionId)
      await Promise.allSettled(stored.map((key) => files.remove(key)))
    }

    try {
      const refs = { train: '', test: '', sample: '' }
      for (const { kind, name, text } of uploads) {
        refs[kind] = await files.put(`competitions/${competitionId}/${kind}.csv`, name, text)
        stored.push(refs[kind])
      }

      const key = await records.create(
        'answer_keys',
        { competitionId, rows: dataset.answerKey, rowCount: dataset.answerKey.length },
        competitionId,
      )
      if (!key.success) throw new Error(`answer_keys: ${key.error}`)
      keySaved = true

      const hostName = await displayName(tools, userId, 'Host')

      const fileRef = ({ kind, name, text }: (typeof uploads)[number]) => ({
        key: refs[kind],
        name,
        bytes: utf8ByteLength(text),
      })
      const created = await records.create(
        'competitions',
        {
          title: input.title,
          summary: input.summary,
          description: input.description,
          taskType: input.taskType,
          metric: input.metric,
          idColumn: input.idColumn,
          targetColumn: input.targetColumn,
          ...(dataset.labels ? { labels: dataset.labels } : {}),
          deadline: input.deadline,
          dailyLimit: input.dailyLimit,
          scoreDecimals: input.scoreDecimals,
          testRows: dataset.testRows,
          publicRows: dataset.publicRows,
          privateRows: dataset.privateRows,
          status: 'open',
          hostId: userId,
          hostName,
          files: {
            train: fileRef(uploads[0]),
            test: fileRef(uploads[1]),
            sample: fileRef(uploads[2]),
          },
        },
        competitionId,
      )
      if (!created.success) throw new Error(`competitions: ${created.error}`)

      return ok({ competitionId })
    } catch (error) {
      console.error(
        `[createCompetition] failed for ${competitionId}: ${error instanceof Error ? error.message : String(error)}`,
      )
      await undo().catch(() => undefined)
      return fail('internal', 'We could not save the competition. Nothing was created. Try again.')
    }
  })
}
