import type { ActionResult } from 'deepspace/worker'
import { describe, expect, it } from 'vitest'
import type { Env } from '../../worker'
import { competitionRecord } from '../contracts/competitions'
import { DAY_MS, HOUR_MS } from '../domain/time'
import { fakeRoom, type FakeRoom } from './fakes'
import { makeUpdateCompetition } from './update-competition'

const NOW = 1_795_046_400_000
const DEADLINE = NOW + 3 * DAY_MS
const HOST = 'user_host'

const COMPETITION = {
  title: 'Palmer Penguins',
  summary: 'Predict the species of a penguin.',
  description: 'The first description.',
  taskType: 'classification',
  metric: 'accuracy',
  idColumn: 'id',
  targetColumn: 'species',
  labels: ['Adelie', 'Chinstrap', 'Gentoo'],
  deadline: DEADLINE,
  dailyLimit: 5,
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

const room = (change: Record<string, unknown> = {}) =>
  fakeRoom({ competitions: { c1: { ...COMPETITION, ...change } } })

type Answer = ActionResult<{ competitionId: string; deadline: number }> & {
  code?: string
  issues?: { path?: string[]; message: string }[]
}

async function update(
  fake: FakeRoom,
  params: Record<string, unknown> = {},
  { userId = HOST, now = NOW } = {},
): Promise<Answer> {
  const action = makeUpdateCompetition({ now: () => now })
  return (await action({
    userId,
    params: {
      competitionId: 'c1',
      title: COMPETITION.title,
      summary: COMPETITION.summary,
      description: COMPETITION.description,
      deadline: DEADLINE,
      ...params,
    },
    tools: fake.tools,
    env: {} as Env,
    callerJwt: 'jwt',
  })) as Answer
}

const stored = (fake: FakeRoom) => competitionRecord.parse(fake.rows('competitions').get('c1'))

describe('updateCompetition', () => {
  it('saves the host’s new title, summary, description and later deadline', async () => {
    const fake = room()
    const answer = await update(fake, {
      title: '  Penguins, round two  ',
      summary: 'Predict the species from four measurements.',
      description: 'Line one.\nLine two.',
      deadline: DEADLINE + DAY_MS,
    })
    expect(answer).toEqual({
      success: true,
      data: { competitionId: 'c1', deadline: DEADLINE + DAY_MS },
    })
    expect(stored(fake)).toMatchObject({
      title: 'Penguins, round two',
      summary: 'Predict the species from four measurements.',
      description: 'Line one.\nLine two.',
      deadline: DEADLINE + DAY_MS,
    })
  })

  it('changes nothing else about the competition', async () => {
    const fake = room()
    await update(fake, { title: 'A new title', deadline: DEADLINE + HOUR_MS })
    const { title: _title, deadline: _deadline, ...rest } = stored(fake)
    const { title: _oldTitle, deadline: _oldDeadline, ...before } = COMPETITION
    expect(rest).toEqual(before)
    expect(fake.calls.filter((call) => call.startsWith('update:'))).toEqual([
      'update:competitions:c1',
    ])
  })

  it('lets the text change with the deadline minutes away', async () => {
    const fake = room({ deadline: NOW + 60_000 })
    const answer = await update(fake, { title: 'Last-minute title', deadline: NOW + 60_000 })
    expect(answer.success).toBe(true)
    expect(stored(fake).title).toBe('Last-minute title')
  })

  it('refuses everyone but the host', async () => {
    const fake = room()
    const answer = await update(fake, { title: 'Hijacked' }, { userId: 'user_other' })
    expect(answer).toMatchObject({
      success: false,
      code: 'forbidden',
      error: 'Only the host can edit this competition.',
    })
    expect(stored(fake).title).toBe('Palmer Penguins')
    expect(fake.calls.some((call) => call.startsWith('update:'))).toBe(false)
  })

  it('says so when the competition does not exist', async () => {
    const answer = await update(room(), { competitionId: 'nope' })
    expect(answer).toMatchObject({ success: false, code: 'not_found' })
  })

  it('refuses once the deadline has passed or the close has begun', async () => {
    const closed = { success: false, code: 'closed' }
    const atDeadline = room()
    expect(await update(atDeadline, { title: 'Too late' }, { now: DEADLINE })).toMatchObject(closed)
    expect(stored(atDeadline).title).toBe('Palmer Penguins')
    expect(await update(room({ status: 'closing' }), { title: 'Too late' })).toMatchObject(closed)
    expect(
      await update(room({ status: 'closed', closedAt: NOW - 1 }), { title: 'Too late' }),
    ).toMatchObject(closed)
    // A later deadline does not reopen a competition that is over.
    expect(
      await update(room(), { deadline: DEADLINE + DAY_MS }, { now: DEADLINE + 1 }),
    ).toMatchObject(closed)
  })

  it('never moves the deadline earlier, and names the field', async () => {
    const fake = room()
    const answer = await update(fake, { title: 'New title', deadline: DEADLINE - 1 })
    expect(answer).toMatchObject({
      success: false,
      code: 'invalid_input',
      issues: [{ path: ['deadline'], message: 'The deadline can only move later.' }],
    })
    // Nothing is saved when one field is refused.
    expect(stored(fake)).toMatchObject({ title: 'Palmer Penguins', deadline: DEADLINE })
  })

  it('keeps the deadline within 90 days of now', async () => {
    const answer = await update(room(), { deadline: NOW + 90 * DAY_MS + 1 })
    expect(answer).toMatchObject({
      success: false,
      code: 'invalid_input',
      issues: [{ path: ['deadline'], message: 'The deadline must be within 90 days from now.' }],
    })
    expect((await update(room(), { deadline: NOW + 90 * DAY_MS })).success).toBe(true)
  })

  it('applies the same rules to the text as creating does', async () => {
    const fake = room()
    const answer = await update(fake, {
      title: 'ab',
      summary: 'too short',
      description: 'x'.repeat(5001),
      deadline: 'tomorrow',
    })
    expect(answer).toMatchObject({ success: false, code: 'invalid_input' })
    expect(answer.issues).toEqual([
      { path: ['title'], message: 'Use at least 3 characters.' },
      { path: ['summary'], message: 'Use at least 10 characters.' },
      { path: ['description'], message: 'Use at most 5,000 characters.' },
      { path: ['deadline'], message: 'Choose a date and time.' },
    ])
    expect(fake.calls).toEqual([])
  })

  it('reports a failed save and leaves the record as it was', async () => {
    const fake = room()
    fake.failOn('update:competitions')
    const answer = await update(fake, { title: 'New title' })
    expect(answer).toMatchObject({
      success: false,
      code: 'internal',
      error: 'We could not save the changes. Try again.',
    })
    expect(stored(fake).title).toBe('Palmer Penguins')
  })
})
