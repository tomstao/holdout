import type { ActionResult } from 'deepspace/worker'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { privateScoreRecord, submissionRecord } from '../contracts/competitions'
import { formatCsv } from '../domain/csv'
import { DAY_MS, HOUR_MS } from '../domain/time'
import { fakeRoom, type FakeRoom } from './fakes'
import { makeSubmitPredictions } from './submit-predictions'

/** 2026-11-19 10:00 UTC. */
const NOW = 1_795_046_400_000 + 10 * HOUR_MS
const TODAY = '2026-11-19'
const MIDNIGHT = 1_795_132_800_000
const HOST = 'user_host'
const ME = 'user_me'

const COMPETITION = {
  title: 'Palmer Penguins',
  summary: 'Predict the species of a penguin.',
  description: '',
  taskType: 'classification',
  metric: 'accuracy',
  idColumn: 'id',
  targetColumn: 'species',
  labels: ['Adelie', 'Chinstrap', 'Gentoo'],
  deadline: NOW + DAY_MS,
  dailyLimit: 2,
  scoreDecimals: 4,
  testRows: 4,
  publicRows: 2,
  privateRows: 2,
  status: 'open',
  hostId: HOST,
  hostName: 'Ada',
  files: {
    train: { key: 'k/train', name: 'train.csv', bytes: 1 },
    test: { key: 'k/test', name: 'test.csv', bytes: 1 },
    sample: { key: 'k/sample', name: 'sample_submission.csv', bytes: 1 },
  },
}

const KEY = {
  competitionId: 'c1',
  rows: [
    ['t1', 'Adelie', 'public'],
    ['t2', 'Gentoo', 'public'],
    ['t3', 'Chinstrap', 'private'],
    ['t4', 'Adelie', 'private'],
  ],
  rowCount: 4,
}

/** Public: t1 right, t2 wrong. Private: t3 right, t4 right. */
const CSV = formatCsv(
  ['id', 'species'],
  [
    ['t1', 'Adelie'],
    ['t2', 'Adelie'],
    ['t3', 'Chinstrap'],
    ['t4', 'Adelie'],
  ],
)

function room(competition: Record<string, unknown> = {}, extra: Record<string, never> = {}) {
  return fakeRoom(
    {
      competitions: { c1: { ...COMPETITION, ...competition } },
      answer_keys: { c1: KEY },
      users: { [ME]: { name: 'Grace', email: 'grace@example.org' } },
      ...extra,
    },
    { uniqueOn: { submissions: ['competitionId', 'participantId', 'utcDay', 'slot'] } },
  )
}

type Answer = ActionResult<{
  submissionId: string
  publicScore: number
  slot: number
  dailyLimit: number
  resetsAt: number
}> & { code?: string; issues?: { path?: string[]; message: string }[] }

async function submit(
  fake: FakeRoom,
  params: Record<string, unknown> = {},
  { userId = ME, now = NOW } = {},
): Promise<Answer> {
  const action = makeSubmitPredictions({ now: () => now })
  return (await action({
    userId,
    params: { competitionId: 'c1', fileName: 'predictions.csv', csv: CSV, ...params },
    tools: fake.tools,
    env: {} as Env,
    callerJwt: 'jwt',
  })) as Answer
}

const submissionsOf = (fake: FakeRoom) => [...fake.rows('submissions').values()]

describe('submitPredictions', () => {
  it('scores the file and answers with the public score only', async () => {
    const fake = room()
    const answer = await submit(fake)
    expect(answer).toEqual({
      success: true,
      data: {
        submissionId: 'generated_1',
        publicScore: 0.5,
        slot: 1,
        dailyLimit: 2,
        resetsAt: MIDNIGHT,
      },
    })
    expect(JSON.stringify(answer)).not.toContain('privateScore')
  })

  it('stores a public submission and its private score apart', async () => {
    const fake = room()
    await submit(fake)
    expect(submissionRecord.parse(fake.rows('submissions').get('generated_1'))).toEqual({
      competitionId: 'c1',
      participantId: ME,
      participantName: 'Grace',
      fileName: 'predictions.csv',
      utcDay: TODAY,
      slot: 1,
      publicScore: 0.5,
      rowCount: 4,
    })
    expect(privateScoreRecord.parse(fake.rows('private_scores').get('generated_1'))).toEqual({
      submissionId: 'generated_1',
      competitionId: 'c1',
      participantId: ME,
      privateScore: 1,
    })
    expect(JSON.stringify(fake.rows('submissions').get('generated_1'))).not.toContain('grace@')
  })

  it('takes the participant from the verified caller, never from the input', async () => {
    const fake = room()
    await submit(fake, { participantId: 'someone_else', participantName: 'Mallory' })
    expect(submissionsOf(fake)[0]).toMatchObject({ participantId: ME, participantName: 'Grace' })
  })

  it('numbers the day’s submissions and refuses the one over the limit', async () => {
    const fake = room()
    expect((await submit(fake)).success).toBe(true)
    const second = await submit(fake)
    expect(second.success && second.data.slot).toBe(2)
    expect(await submit(fake)).toEqual({
      success: false,
      code: 'limit_reached',
      error: 'You have used all 2 submissions for today. The count resets at 00:00 UTC.',
    })
    expect(submissionsOf(fake)).toHaveLength(2)
  })

  it('starts a new count after 00:00 UTC', async () => {
    const fake = room()
    await submit(fake)
    await submit(fake)
    const tomorrow = await submit(fake, {}, { now: MIDNIGHT + HOUR_MS })
    expect(tomorrow.success && tomorrow.data).toMatchObject({
      slot: 1,
      resetsAt: MIDNIGHT + DAY_MS,
    })
  })

  it('counts each participant and each competition apart', async () => {
    const fake = room()
    await submit(fake)
    await submit(fake)
    const other = await submit(fake, {}, { userId: 'user_other' })
    expect(other.success && other.data.slot).toBe(1)
    expect(submissionsOf(fake).at(-1)).toMatchObject({ participantName: 'Participant' })
  })
})

describe('submitPredictions refusals', () => {
  it('refuses an unknown competition', async () => {
    expect(await submit(room(), { competitionId: 'nope' })).toEqual({
      success: false,
      code: 'not_found',
      error: 'This competition does not exist.',
    })
  })

  it('refuses the host', async () => {
    const answer = await submit(room(), {}, { userId: HOST })
    expect(answer).toMatchObject({ success: false, code: 'forbidden' })
  })

  it('refuses at and after the deadline, and once the competition is no longer open', async () => {
    expect(await submit(room({ deadline: NOW }))).toMatchObject({ code: 'closed' })
    expect(await submit(room({ deadline: NOW - 1 }))).toMatchObject({ code: 'closed' })
    expect(await submit(room({ status: 'closing' }))).toMatchObject({ code: 'closed' })
    expect((await submit(room({ deadline: NOW + 1 }))).success).toBe(true)
  })

  it('refuses a file with problems and uses no slot', async () => {
    const fake = room()
    const bad = formatCsv(
      ['id', 'species'],
      [
        ['t1', 'Adelie'],
        ['t2', 'Emperor'],
        ['t3', 'Chinstrap'],
        ['t9', 'Adelie'],
      ],
    )
    expect(await submit(fake, { csv: bad })).toEqual({
      success: false,
      code: 'invalid_file',
      error: 'The file has problems. Fix them and try again; this did not use a submission.',
      issues: [
        {
          path: ['row 3', 'species'],
          message: '"Emperor" is not one of the labels: Adelie, Chinstrap, Gentoo.',
        },
      ],
    })
    expect(submissionsOf(fake)).toHaveLength(0)

    const unknown = formatCsv(
      ['id', 'species'],
      [
        ['t1', 'Adelie'],
        ['t2', 'Adelie'],
        ['t3', 'Adelie'],
        ['t9', 'Adelie'],
      ],
    )
    expect((await submit(fake, { csv: unknown })).issues).toEqual([
      { path: ['row 5', 'id'], message: 'The ID "t9" is not a test ID.' },
      { path: ['id'], message: 'The test ID "t4" has no prediction.' },
    ])
  })

  it('refuses input that breaks the contract', async () => {
    expect(await submit(room(), { csv: '' })).toMatchObject({
      success: false,
      code: 'invalid_input',
      issues: [{ path: ['csv'], message: 'The file is empty.' }],
    })
  })
})

describe('submitPredictions under concurrency', () => {
  it('takes the next slot when another submission claimed this one first', async () => {
    const fake = room()
    fake.before('create:submissions', () => {
      fake.rows('submissions').set('concurrent', {
        competitionId: 'c1',
        participantId: ME,
        utcDay: TODAY,
        slot: 1,
      })
    })
    const answer = await submit(fake)
    expect(answer.success && answer.data.slot).toBe(2)
    expect(
      submissionsOf(fake)
        .map((row) => row.slot)
        .sort(),
    ).toEqual([1, 2])
  })

  it('answers limit_reached when the concurrent submission took the last slot', async () => {
    const fake = room({ dailyLimit: 1 })
    fake.before('create:submissions', () => {
      fake.rows('submissions').set('concurrent', {
        competitionId: 'c1',
        participantId: ME,
        utcDay: TODAY,
        slot: 1,
      })
    })
    expect(await submit(fake)).toMatchObject({ success: false, code: 'limit_reached' })
  })

  it('answers conflict after a second collision, and stores nothing', async () => {
    const fake = room({ dailyLimit: 5 })
    const claim = (slot: number) => () => {
      fake.rows('submissions').set(`concurrent_${slot}`, {
        competitionId: 'c1',
        participantId: ME,
        utcDay: TODAY,
        slot,
      })
    }
    fake.before('create:submissions', claim(1))
    // A second concurrent submission takes slot 2 just before the retry claims it.
    const original = fake.tools.create.bind(fake.tools)
    let creates = 0
    fake.tools.create = (collection, data, recordId) => {
      if (collection === 'submissions' && ++creates === 2) claim(2)()
      return original(collection, data, recordId)
    }
    expect(await submit(fake)).toEqual({
      success: false,
      code: 'conflict',
      error: 'Another submission of yours is being scored. Try again in a moment.',
    })
    expect(fake.rows('private_scores').size).toBe(0)
  })
})

describe('submitPredictions when storing fails', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => undefined)

  it('removes the submission when the private score cannot be written', async () => {
    const error = quiet()
    const fake = room()
    fake.failOn('create:private_scores')
    expect(await submit(fake)).toEqual({
      success: false,
      code: 'internal',
      error: 'We could not record the submission. It did not count. Try again.',
    })
    expect(fake.calls).toContain('remove:submissions:generated_1')
    expect(submissionsOf(fake)).toHaveLength(0)
    expect(String(error.mock.calls[0]?.[0])).toContain('private_scores: fake failure')
    error.mockRestore()
  })

  it('answers internal when the submission cannot be written or counted', async () => {
    const error = quiet()
    const failedCreate = room()
    failedCreate.failOn('create:submissions')
    expect(await submit(failedCreate)).toMatchObject({ code: 'internal' })
    expect(failedCreate.rows('private_scores').size).toBe(0)

    const failedCount = room()
    failedCount.failOn('query:submissions')
    expect(await submit(failedCount)).toMatchObject({ code: 'internal' })
    error.mockRestore()
  })

  it('answers internal when the answer key is missing', async () => {
    const error = quiet()
    const fake = room()
    fake.rows('answer_keys').delete('c1')
    expect(await submit(fake)).toEqual({
      success: false,
      code: 'internal',
      error: 'This competition cannot score submissions right now.',
    })
    error.mockRestore()
  })
})
