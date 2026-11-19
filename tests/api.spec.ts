import { test, expect } from '@playwright/test'
import { test as signedIn, loadAllTestAccounts } from 'deepspace/testing'
import {
  callAction,
  competitionInput,
  createCompetition,
  readCompetition,
  removeStoredFiles,
  SAMPLE_CSV,
  TEST_CSV,
  TRAIN_CSV,
} from './helpers/competitions'
import { authToken } from './helpers/room'

test.describe('API tests', () => {
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  test('WebSocket endpoint exists', async ({ page }) => {
    // /home is a dynamic page (under src/pages/(app)/), so mounting it boots
    // the providers and auto-connects the records WebSocket. The static
    // landing at '/' deliberately does neither — see smoke.spec.ts.
    await page.goto('/home')
    // Wait for the app to connect its WebSocket (it auto-connects on mount)
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
    // If the app loaded and connected, the WS endpoint works
  })
})

/**
 * createCompetition and the files route, against the real room and the real
 * file storage. Needs one test account.
 */
const NEEDS_ACCOUNT =
  'Needs a test account: `npx deepspace test accounts create --email <name>@deepspace.test --password-stdin`.'

test.describe('createCompetition without a session', () => {
  test('answers 401', async ({ page }) => {
    const { response } = await callAction(page, 'createCompetition', competitionInput(), null)
    expect(response.status()).toBe(401)
  })
})

signedIn.describe('createCompetition', () => {
  signedIn.skip(loadAllTestAccounts().length < 1, NEEDS_ACCOUNT)

  signedIn('refuses input that breaks the contract, naming the field', async ({ users }) => {
    const [host] = await users(1)
    await host.page.goto('/home')
    const token = await authToken(host.page)
    const { response, body } = await callAction(
      host.page,
      'createCompetition',
      competitionInput({ title: 'ab', dailyLimit: 99 }),
      token,
    )
    expect(response.status()).toBe(200)
    expect(body).toMatchObject({ success: false, code: 'invalid_input' })
    expect(body.issues?.map((issue) => issue.path?.join('.')).sort()).toEqual([
      'dailyLimit',
      'title',
    ])
  })

  signedIn('refuses a deadline less than an hour ahead', async ({ users }) => {
    const [host] = await users(1)
    await host.page.goto('/home')
    const { body } = await callAction(
      host.page,
      'createCompetition',
      competitionInput({ deadline: Date.now() + 60_000 }),
      await authToken(host.page),
    )
    expect(body).toMatchObject({
      success: false,
      code: 'invalid_input',
      issues: [{ path: ['deadline'], message: 'The deadline must be at least 1 hour from now.' }],
    })
  })

  signedIn('refuses files with problems and says where they are', async ({ users }) => {
    const [host] = await users(1)
    await host.page.goto('/home')
    const input = competitionInput()
    // t2 has no target and t9 is not a test ID (t6 is missing).
    input.files.solution.csv = [
      'id,species',
      't1,Adelie',
      't2,',
      't3,Chinstrap',
      't4,Adelie',
      't5,Gentoo',
      't9,Gentoo',
      '',
    ].join('\n')
    const { body } = await callAction(
      host.page,
      'createCompetition',
      input,
      await authToken(host.page),
    )
    expect(body).toMatchObject({ success: false, code: 'invalid_file' })
    expect(body.issues).toEqual([
      { path: ['test', 'row 7', 'id'], message: 'The ID "t6" is not in solution.csv.' },
      { path: ['solution', 'row 3', 'species'], message: 'The target is empty.' },
      { path: ['solution', 'row 7', 'id'], message: 'The ID "t9" is not in test.csv.' },
    ])
  })

  signedIn('creates a competition anyone can read and download', async ({ users, browser }) => {
    const [host] = await users(1)
    await host.page.goto('/home')
    const { competitionId, token } = await createCompetition(host.page)
    try {
      // A signed-out visitor, in a browser of their own.
      const context = await browser.newContext()
      const visitor = await context.newPage()
      await visitor.goto('/home')

      const competition = await readCompetition(visitor, competitionId)
      expect(competition?.data).toMatchObject({
        status: 'open',
        taskType: 'classification',
        metric: 'accuracy',
        labels: ['Adelie', 'Chinstrap', 'Gentoo'],
        testRows: 6,
        dailyLimit: 5,
        scoreDecimals: 4,
      })
      expect(competition?.data.title).toMatch(/^__test-\d+__ Palmer Penguins$/)
      expect(Number(competition?.data.publicRows) + Number(competition?.data.privateRows)).toBe(6)
      // Nothing of the answer key is on the public record.
      expect(JSON.stringify(competition)).not.toContain('"rows"')
      expect(JSON.stringify(competition)).not.toContain('solution')

      const expected = { train: TRAIN_CSV, test: TEST_CSV, sample: SAMPLE_CSV }
      const names = { train: 'train.csv', test: 'test.csv', sample: 'sample_submission.csv' }
      for (const kind of ['train', 'test', 'sample'] as const) {
        const file = await visitor.request.get(`/api/competitions/${competitionId}/files/${kind}`)
        expect(file.status(), kind).toBe(200)
        expect(await file.text(), kind).toBe(expected[kind])
        expect(file.headers()['content-type']).toBe('text/csv; charset=utf-8')
        expect(file.headers()['content-disposition']).toBe(`attachment; filename="${names[kind]}"`)
      }

      for (const path of [
        `/api/competitions/${competitionId}/files/solution`,
        `/api/competitions/${competitionId}/files/constructor`,
        '/api/competitions/no-such-competition/files/train',
      ]) {
        expect((await visitor.request.get(path)).status(), path).toBe(404)
      }

      // The stored file itself is private to the host: no session, no file.
      const direct = await visitor.request.get(
        `/api/files/${competition?.data.files.train.key ?? ''}?scope=self`,
      )
      expect(direct.status()).toBe(401)
      await context.close()
    } finally {
      await removeStoredFiles(host.page, token, competitionId)
    }
  })
})
