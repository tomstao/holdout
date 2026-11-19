/**
 * The submit action's last line of defence: should scoring ever return a
 * score that is not a finite number, nothing is stored. The file checks make
 * that unreachable today (src/domain/text.ts), so scoring is replaced here.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { fakeRoom } from './fakes'
import { makeSubmitPredictions } from './submit-predictions'

const scores = vi.hoisted(() => ({ publicScore: 0.5, privateScore: 0.5 }))
vi.mock('../domain/scoring', () => ({ scoreSubmission: () => scores }))

const NOW = 1_795_046_400_000

function room() {
  return fakeRoom({
    competitions: {
      c1: {
        title: 'Prices',
        summary: 'Predict the price of a house.',
        description: '',
        taskType: 'regression',
        metric: 'rmse',
        idColumn: 'id',
        targetColumn: 'price',
        deadline: NOW + 86_400_000,
        dailyLimit: 5,
        scoreDecimals: 4,
        testRows: 2,
        publicRows: 1,
        privateRows: 1,
        status: 'open',
        hostId: 'user_host',
        hostName: 'Ada',
        files: {
          train: { key: 'k/train', name: 'train.csv', bytes: 1 },
          test: { key: 'k/test', name: 'test.csv', bytes: 1 },
          sample: { key: 'k/sample', name: 'sample_submission.csv', bytes: 1 },
        },
      },
    },
    answer_keys: {
      c1: {
        competitionId: 'c1',
        rows: [
          ['t1', '10', 'public'],
          ['t2', '20', 'private'],
        ],
        rowCount: 2,
      },
    },
  })
}

async function submit(fake: ReturnType<typeof room>) {
  const action = makeSubmitPredictions({ now: () => NOW })
  return action({
    userId: 'user_me',
    params: { competitionId: 'c1', fileName: 'predictions.csv', csv: 'id,price\nt1,10\nt2,20\n' },
    tools: fake.tools,
    env: {} as Env,
    callerJwt: 'jwt',
  })
}

describe('submitPredictions with a score that is not a number', () => {
  const refused = {
    success: false,
    code: 'invalid_file',
    issues: [
      { path: [], message: 'These predictions cannot be scored: the result is not a number.' },
    ],
  }

  it.each([
    ['the private score', { publicScore: 0.5, privateScore: Number.NaN }],
    ['the public score', { publicScore: Number.POSITIVE_INFINITY, privateScore: 0.5 }],
    ['both', { publicScore: Number.NaN, privateScore: Number.NEGATIVE_INFINITY }],
  ])('stores nothing and gives the same answer when it is %s', async (_which, bad) => {
    Object.assign(scores, bad)
    const fake = room()
    expect(await submit(fake)).toMatchObject(refused)
    expect(fake.rows('submissions').size).toBe(0)
    expect(fake.rows('private_scores').size).toBe(0)
    expect(fake.calls.some((call) => call.startsWith('create:'))).toBe(false)
  })

  it('records a submission when both scores are numbers', async () => {
    Object.assign(scores, { publicScore: 0.25, privateScore: 0.75 })
    const fake = room()
    expect(await submit(fake)).toMatchObject({ success: true, data: { publicScore: 0.25 } })
    expect(fake.rows('private_scores').size).toBe(1)
  })
})
