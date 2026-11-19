/**
 * submitPredictions against the real record room: scoring, the refusals, the
 * daily limit, and the slot claim under two simultaneous requests
 * (docs/decisions/0008-daily-limit-with-uniqueon-slots.md).
 *
 * Needs two test accounts: one hosts, the other submits.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import {
  callAction,
  createCompetition,
  removeStoredFiles,
  SAMPLE_CSV,
  SOLUTION_CSV,
} from './helpers/competitions'
import { authToken, recordsOf, roomExchange, subscribe } from './helpers/room'

test.skip(
  loadAllTestAccounts().length < 2,
  'Needs two test accounts: `npx deepspace test accounts create --email <name>@deepspace.test --password-stdin`.',
)

const submit = (page: Page, token: string | null, competitionId: string, csv: string) =>
  callAction(page, 'submitPredictions', { competitionId, fileName: 'predictions.csv', csv }, token)

interface Setup {
  host: Page
  participant: Page
  hostToken: string
  token: string
  competitionId: string
}

/** A fresh competition hosted by the first account; the second account will submit. */
async function setUp(
  users: (count: number) => Promise<{ page: Page }[]>,
  overrides: Record<string, unknown> = {},
): Promise<Setup> {
  const [hostUser, participantUser] = await users(2)
  await Promise.all([hostUser.page.goto('/home'), participantUser.page.goto('/home')])
  const { competitionId, token: hostToken } = await createCompetition(hostUser.page, overrides)
  const token = await authToken(participantUser.page)
  if (!token) throw new Error('the participant has no token')
  return { host: hostUser.page, participant: participantUser.page, hostToken, token, competitionId }
}

test('without a session the action answers 401', async ({ page }) => {
  await page.goto('/home')
  const { response } = await submit(page, null, 'any', SAMPLE_CSV)
  expect(response.status()).toBe(401)
})

test('a participant is scored; the score is public, the private one is not', async ({ users }) => {
  const setup = await setUp(users)
  try {
    const perfect = await submit(setup.participant, setup.token, setup.competitionId, SOLUTION_CSV)
    expect(perfect.body).toMatchObject({
      success: true,
      data: { publicScore: 1, slot: 1, dailyLimit: 5 },
    })
    expect(Object.keys(perfect.body.data ?? {}).sort()).toEqual([
      'dailyLimit',
      'publicScore',
      'resetsAt',
      'slot',
      'submissionId',
    ])
    const resetsAt = Number(perfect.body.data?.resetsAt)
    expect(resetsAt % 86_400_000).toBe(0)
    expect(resetsAt - Date.now()).toBeLessThanOrEqual(86_400_000)

    // Every prediction "Adelie": two of the six are right.
    const sample = await submit(setup.participant, setup.token, setup.competitionId, SAMPLE_CSV)
    expect(sample.body).toMatchObject({ success: true, data: { slot: 2 } })

    // Everyone sees the submissions and their public scores; nobody sees a private score.
    const frames = await roomExchange(setup.host, setup.hostToken, [
      subscribe('submissions', 'mine', { competitionId: setup.competitionId }),
      subscribe('private_scores'),
    ])
    const rows = (recordsOf(frames, 'mine') ?? []) as { data: Record<string, unknown> }[]
    expect(rows.map((row) => row.data.slot).sort()).toEqual([1, 2])
    expect(rows.every((row) => !('privateScore' in row.data))).toBe(true)
    expect(recordsOf(frames, 'private_scores')).toEqual([])
    const own = await roomExchange(setup.participant, setup.token, [subscribe('private_scores')])
    expect(recordsOf(own, 'private_scores')).toEqual([])
  } finally {
    await removeStoredFiles(setup.host, setup.hostToken, setup.competitionId)
  }
})

test('the refusals: unknown competition, the host, and a bad file', async ({ users }) => {
  const setup = await setUp(users)
  try {
    expect((await submit(setup.participant, setup.token, 'nope', SAMPLE_CSV)).body).toMatchObject({
      success: false,
      code: 'not_found',
    })
    expect(
      (await submit(setup.host, setup.hostToken, setup.competitionId, SAMPLE_CSV)).body,
    ).toMatchObject({ success: false, code: 'forbidden' })

    const bad = SAMPLE_CSV.replace('t3,Adelie', 't3,Emperor').replace('t6,', 't9,')
    const refused = await submit(setup.participant, setup.token, setup.competitionId, bad)
    expect(refused.body).toMatchObject({ success: false, code: 'invalid_file' })
    expect(refused.body.issues).toEqual([
      {
        path: ['row 4', 'species'],
        message: '"Emperor" is not one of the labels: Adelie, Chinstrap, Gentoo.',
      },
    ])

    // The refused file used no slot.
    const first = await submit(setup.participant, setup.token, setup.competitionId, SAMPLE_CSV)
    expect(first.body).toMatchObject({ success: true, data: { slot: 1 } })
  } finally {
    await removeStoredFiles(setup.host, setup.hostToken, setup.competitionId)
  }
})

test('the daily limit holds against two submissions sent at once', async ({ users }) => {
  const setup = await setUp(users, { dailyLimit: 1 })
  try {
    const answers = await Promise.all([
      submit(setup.participant, setup.token, setup.competitionId, SAMPLE_CSV),
      submit(setup.participant, setup.token, setup.competitionId, SOLUTION_CSV),
    ])
    const codes = answers.map((answer) => (answer.body.success ? 'ok' : answer.body.code)).sort()
    // One is scored; the other finds the only slot taken.
    expect(codes).toEqual(['limit_reached', 'ok'])

    const later = await submit(setup.participant, setup.token, setup.competitionId, SAMPLE_CSV)
    expect(later.body).toEqual({
      success: false,
      code: 'limit_reached',
      error: 'You have used all 1 submissions for today. The count resets at 00:00 UTC.',
    })

    const frames = await roomExchange(setup.participant, setup.token, [
      subscribe('submissions', 'all', { competitionId: setup.competitionId }),
    ])
    expect(recordsOf(frames, 'all')).toHaveLength(1)
  } finally {
    await removeStoredFiles(setup.host, setup.hostToken, setup.competitionId)
  }
})
