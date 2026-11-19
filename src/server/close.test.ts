import { describe, expect, it } from 'vitest'
import { fakeRoom, type FakeRoom } from '../actions/fakes'
import { finalStandingRecord } from '../contracts/competitions'
import {
  CLOSE_CHUNK,
  CLOSE_GRACE_MS,
  CLOSE_MAX_ATTEMPTS,
  closeCompetition,
  closeDueCompetitions,
  STUCK_AFTER_MS,
  type CloseStep,
} from './close'

const DEADLINE = 1_795_000_000_000
const SETTLED = DEADLINE + CLOSE_GRACE_MS

const competition = (change: Record<string, unknown> = {}) => ({
  title: 'Palmer Penguins',
  summary: 'Predict the species of a penguin.',
  description: '',
  taskType: 'classification',
  metric: 'accuracy',
  idColumn: 'id',
  targetColumn: 'species',
  labels: ['Adelie', 'Gentoo'],
  deadline: DEADLINE,
  dailyLimit: 5,
  scoreDecimals: 4,
  testRows: 10,
  publicRows: 3,
  privateRows: 7,
  status: 'open',
  hostId: 'host',
  hostName: 'Ada',
  files: {
    train: { key: 'k/train', name: 'train.csv', bytes: 1 },
    test: { key: 'k/test', name: 'test.csv', bytes: 1 },
    sample: { key: 'k/sample', name: 'sample_submission.csv', bytes: 1 },
  },
  ...change,
})

const submission = (participantId: string, publicScore: number, competitionId = 'c1') => ({
  competitionId,
  participantId,
  participantName: participantId.toUpperCase(),
  fileName: 'predictions.csv',
  utcDay: '2026-11-18',
  slot: 1,
  publicScore,
  rowCount: 10,
})

const privateScore = (submissionId: string, participantId: string, score: number) => ({
  submissionId,
  competitionId: 'c1',
  participantId,
  privateScore: score,
})

/** Ann leads in public and falls; Bob climbs. */
function scoredRoom(change: Record<string, unknown> = {}): FakeRoom {
  return fakeRoom(
    {
      competitions: { c1: competition(change) },
      submissions: {
        s1: submission('ann', 0.9),
        s2: submission('ann', 0.8),
        s3: submission('ann', 0.2),
        s4: submission('bob', 0.7),
        other: submission('zed', 1, 'c2'),
      },
      private_scores: {
        s1: privateScore('s1', 'ann', 0.5),
        s2: privateScore('s2', 'ann', 0.6),
        s3: privateScore('s3', 'ann', 0.99),
        s4: privateScore('s4', 'bob', 0.75),
      },
    },
    {
      createdAt: {
        s1: '2026-11-18T10:00:00.000Z',
        s2: '2026-11-18T11:00:00.000Z',
        s3: '2026-11-18T12:00:00.000Z',
        s4: '2026-11-18T13:00:00.000Z',
      },
    },
  )
}

/** A job step that records what it was told. */
function step(resumeFrom?: unknown) {
  const told = {
    progress: [] as [number, string | undefined][],
    continued: [] as [unknown, number | undefined][],
  }
  const handle: CloseStep = {
    resumeFrom,
    progress: (value, message) => told.progress.push([value, message]),
    continueWith: (state, afterMs) => told.continued.push([state, afterMs]),
  }
  return { handle, told }
}

describe('closeDueCompetitions', () => {
  const run = async (room: FakeRoom, now: number) => {
    const enqueued: string[] = []
    const started = await closeDueCompetitions({
      tools: room.tools,
      now: () => now,
      enqueue: (id) => Promise.resolve(enqueued.push(id)),
    })
    return { started, enqueued }
  }

  it('marks a competition whose deadline has passed and enqueues its job', async () => {
    const room = fakeRoom({
      competitions: {
        due: competition(),
        atDeadline: competition({ deadline: DEADLINE + 60_000 }),
        later: competition({ deadline: DEADLINE + 60_001 }),
        done: competition({ status: 'closed', closedAt: DEADLINE }),
      },
    })
    const { started, enqueued } = await run(room, DEADLINE + 60_000)
    expect(started.sort()).toEqual(['atDeadline', 'due'])
    expect(enqueued.sort()).toEqual(['atDeadline', 'due'])
    expect(room.rows('competitions').get('due')).toMatchObject({
      status: 'closing',
      closingStartedAt: DEADLINE + 60_000,
    })
    expect(room.rows('competitions').get('later')?.status).toBe('open')
    expect(room.rows('competitions').get('done')?.status).toBe('closed')
  })

  it('does nothing when it is run early', async () => {
    const room = fakeRoom({ competitions: { c1: competition() } })
    const { started } = await run(room, DEADLINE - 1)
    expect(started).toEqual([])
    expect(room.rows('competitions').get('c1')?.status).toBe('open')
    expect(room.calls.some((call) => call.startsWith('update:'))).toBe(false)
  })

  it('leaves a competition that is closing alone, until it has been stuck for ten minutes', async () => {
    const closing = { status: 'closing', closingStartedAt: DEADLINE + 60_000 }
    const fresh = fakeRoom({ competitions: { c1: competition(closing) } })
    expect((await run(fresh, DEADLINE + 60_000 + STUCK_AFTER_MS - 1)).started).toEqual([])

    const stuck = fakeRoom({ competitions: { c1: competition(closing) } })
    const { started } = await run(stuck, DEADLINE + 60_000 + STUCK_AFTER_MS)
    expect(started).toEqual(['c1'])
    expect(stuck.rows('competitions').get('c1')?.closingStartedAt).toBe(
      DEADLINE + 60_000 + STUCK_AFTER_MS,
    )
  })

  it('fails loudly when it cannot read or mark a competition', async () => {
    const unreadable = fakeRoom({ competitions: { c1: competition() } })
    unreadable.failOn('query:competitions')
    await expect(run(unreadable, DEADLINE)).rejects.toThrow('competitions (open)')

    const unwritable = fakeRoom({ competitions: { c1: competition() } })
    unwritable.failOn('update:competitions')
    await expect(run(unwritable, DEADLINE)).rejects.toThrow('competitions c1')
  })
})

describe('closeCompetition', () => {
  const close = (room: FakeRoom, now: number, resumeFrom?: unknown, id = 'c1') => {
    const { handle, told } = step(resumeFrom)
    return closeCompetition(id, handle, { tools: room.tools, now: () => now }).then((result) => ({
      result,
      told,
    }))
  }

  it('writes the final standings and closes the competition', async () => {
    const room = scoredRoom({ status: 'closing', closingStartedAt: DEADLINE })
    const { result } = await close(room, SETTLED)
    expect(result).toEqual({ status: 'closed', participants: 2, submissions: 4 })
    expect(room.rows('competitions').get('c1')).toMatchObject({
      status: 'closed',
      closedAt: SETTLED,
    })

    const standings = room.rows('final_standings')
    expect([...standings.keys()].sort()).toEqual(['c1:ann', 'c1:bob'])
    // Bob's 0.75 beats the better of Ann's two best public submissions, 0.6.
    expect(finalStandingRecord.parse(standings.get('c1:bob'))).toEqual({
      competitionId: 'c1',
      participantId: 'bob',
      participantName: 'BOB',
      rank: 1,
      finalScore: 0.75,
      publicRank: 2,
      publicScore: 0.7,
      submissionCount: 1,
      chosen: [{ submissionId: 's4', publicScore: 0.7, privateScore: 0.75 }],
    })
    expect(finalStandingRecord.parse(standings.get('c1:ann'))).toMatchObject({
      rank: 2,
      finalScore: 0.6,
      publicRank: 1,
      submissionCount: 3,
      chosen: [
        { submissionId: 's1', publicScore: 0.9, privateScore: 0.5 },
        { submissionId: 's2', publicScore: 0.8, privateScore: 0.6 },
      ],
    })
  })

  it('publishes only the private scores of the chosen submissions', async () => {
    const room = scoredRoom()
    await close(room, SETTLED)
    // Ann's third submission scored 0.99 in private and was not chosen.
    expect(JSON.stringify([...room.rows('final_standings').values()])).not.toContain('0.99')
  })

  it('does nothing before the deadline, as an early run would find it', async () => {
    const room = scoredRoom()
    const { result } = await close(room, DEADLINE - 1)
    expect(result).toEqual({ status: 'skipped', reason: 'not_due' })
    expect(room.rows('final_standings').size).toBe(0)
    expect(room.rows('competitions').get('c1')?.status).toBe('open')
  })

  it('opens a competition again when its deadline moved later after it was marked', async () => {
    const room = scoredRoom({
      status: 'closing',
      closingStartedAt: DEADLINE,
      deadline: DEADLINE + 3_600_000,
    })
    const { result } = await close(room, DEADLINE + 5_000)
    expect(result).toEqual({ status: 'skipped', reason: 'reopened' })
    expect(room.rows('competitions').get('c1')).toMatchObject({
      status: 'open',
      deadline: DEADLINE + 3_600_000,
    })
    expect(room.rows('final_standings').size).toBe(0)

    const stuck = scoredRoom({ status: 'closing', deadline: DEADLINE + 3_600_000 })
    stuck.failOn('update:competitions')
    await expect(close(stuck, DEADLINE + 5_000)).rejects.toThrow('competitions c1')
  })

  it('waits out the grace period after the deadline before it reads anything', async () => {
    const room = scoredRoom()
    const { result, told } = await close(room, DEADLINE + 4_000)
    expect(result).toBeUndefined()
    expect(told.continued).toEqual([[{ next: 0 }, CLOSE_GRACE_MS - 4_000]])
    expect(room.calls.some((call) => call.startsWith('query:'))).toBe(false)
  })

  it('leaves a closed competition and an unknown one alone', async () => {
    const closed = scoredRoom({ status: 'closed', closedAt: DEADLINE })
    expect((await close(closed, SETTLED)).result).toEqual({
      status: 'skipped',
      reason: 'already_closed',
    })
    expect(closed.rows('final_standings').size).toBe(0)
    expect((await close(scoredRoom(), SETTLED, undefined, 'nope')).result).toEqual({
      status: 'skipped',
      reason: 'not_found',
    })
  })

  it('gives the same standings when it runs twice', async () => {
    const room = scoredRoom()
    await close(room, SETTLED)
    const first = JSON.stringify([...room.rows('final_standings')])
    room.rows('competitions').set('c1', competition({ status: 'closing' }))
    await close(room, SETTLED + 60_000)
    expect(JSON.stringify([...room.rows('final_standings')])).toBe(first)
  })

  it('closes a competition nobody submitted to', async () => {
    const room = fakeRoom({ competitions: { c1: competition() } })
    expect((await close(room, SETTLED)).result).toEqual({
      status: 'closed',
      participants: 0,
      submissions: 0,
    })
  })

  it('leaves out a submission that has no private score', async () => {
    const room = scoredRoom()
    room.rows('private_scores').delete('s4')
    const { result } = await close(room, SETTLED)
    expect(result).toEqual({ status: 'closed', participants: 1, submissions: 3 })
    expect([...room.rows('final_standings').keys()]).toEqual(['c1:ann'])
  })

  it('writes many standings in steps, resuming where it stopped', async () => {
    const participants = Array.from({ length: CLOSE_CHUNK * 2 + 5 }, (_, index) => `p${index}`)
    const room = fakeRoom({
      competitions: { c1: competition() },
      submissions: Object.fromEntries(
        participants.map((id, index) => [`s-${id}`, submission(id, index / 100)]),
      ),
      private_scores: Object.fromEntries(
        participants.map((id, index) => [`s-${id}`, privateScore(`s-${id}`, id, index / 100)]),
      ),
    })

    const first = await close(room, SETTLED)
    expect(first.result).toBeUndefined()
    expect(first.told.continued).toEqual([[{ next: CLOSE_CHUNK }, undefined]])
    expect(first.told.progress[0]?.[1]).toBe(`${CLOSE_CHUNK} of ${participants.length} standings`)
    expect(room.rows('final_standings').size).toBe(CLOSE_CHUNK)
    expect(room.rows('competitions').get('c1')?.status).toBe('open')

    const second = await close(room, SETTLED + 100, { next: CLOSE_CHUNK })
    expect(second.told.continued).toEqual([[{ next: CLOSE_CHUNK * 2 }, undefined]])
    expect(room.rows('final_standings').size).toBe(CLOSE_CHUNK * 2)

    const last = await close(room, SETTLED + 200, { next: CLOSE_CHUNK * 2 })
    expect(last.result).toEqual({
      status: 'closed',
      participants: participants.length,
      submissions: participants.length,
    })
    expect(room.rows('final_standings').size).toBe(participants.length)
    const ranks = [...room.rows('final_standings').values()].map((row) => row.rank as number)
    expect(ranks.sort((a, b) => a - b)).toEqual(participants.map((_, index) => index + 1))
  })

  it('ignores a checkpoint it does not understand', async () => {
    const room = scoredRoom()
    for (const junk of ['x', { next: -3 }, { next: 1.5 }, null]) {
      room.rows('competitions').set('c1', competition())
      expect((await close(room, SETTLED, junk)).result).toMatchObject({ status: 'closed' })
    }
  })

  it('fails, so the job is retried, when a standing or the competition cannot be written', async () => {
    const standings = scoredRoom()
    standings.failOn('create:final_standings')
    await expect(close(standings, SETTLED)).rejects.toThrow('final_standings')
    expect(standings.rows('competitions').get('c1')?.status).toBe('open')

    const marking = scoredRoom()
    marking.failOn('update:competitions')
    await expect(close(marking, SETTLED)).rejects.toThrow('competitions c1')

    const reading = scoredRoom()
    reading.failOn('query:private_scores')
    await expect(close(reading, SETTLED)).rejects.toThrow('private_scores')
  })
})

describe('the close job’s attempts', () => {
  it('cover every step of the largest close the spec is designed for, with failures to spare', () => {
    // The job room counts a step that ends in "continue" as an attempt.
    const steps = 1 + Math.ceil(200 / CLOSE_CHUNK)
    expect(steps).toBe(6)
    expect(CLOSE_MAX_ATTEMPTS).toBeGreaterThanOrEqual(steps + 3)
  })
})
