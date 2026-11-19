/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * `users(2)` takes any two accounts from your pool, so this spec passes on a
 * fresh app with no setup beyond having two test accounts:
 *   npx deepspace test accounts list
 *   npx deepspace test accounts create --email a@deepspace.test --name "A" --password-stdin
 *
 * Ask for accounts *by name* (`users(['Alice', 'Bob'])`) only when the
 * behaviour under test depends on which identity acts — otherwise naming them
 * couples the spec to one machine's pool.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
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
import { authToken } from './helpers/room'

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into three red tests about the app, which it is not. Skip the file instead
// and say what creates the pool. The count is of accounts usable HERE: the
// pool is global per developer, but passwords live only on the machine that
// created the account.
const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

test('each browser renders its own signed-in account', async ({ users }) => {
  const [a, b] = await users(2)

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('API status page renders loading success and error states', async ({ users }) => {
  const [user] = await users(1)
  let shouldFail = false
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
      })
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { integrations: { openai: {}, wikipedia: {} } },
      }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()
  await expect(user.page.getByText('2 integrations available.')).toBeVisible()

  shouldFail = true
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(user.page.getByText('Catalog unavailable')).toBeVisible()
  await expect(user.page.getByText('Showing the last loaded catalog')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('API status page shows local retry after first-load API failure', async ({ users }) => {
  const [user] = await users(1)
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Could not load API data')).toBeVisible()
  await expect(user.page.getByText('Retried 1 time automatically.')).toBeVisible()

  const retryButton = user.page.getByRole('button', { name: 'Retry' })
  await expect(retryButton).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await retryButton.click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

/**
 * Holdout's core multi-user promise (spec F3): a submission appears on every
 * other open leaderboard without a reload, rows reorder by best score with
 * ties to the earlier best, and the daily limit stops the next submission
 * with the time it resets. One host and two participants.
 */
test.describe('the live leaderboard', () => {
  test.skip(
    loadAllTestAccounts().length < 3,
    'Needs 3 test accounts (a host and two participants). Create one with ' +
      '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" --password-stdin`.',
  )

  async function submitThroughThePage(page: Page, csv: string) {
    await page.getByRole('tab', { name: 'Submit' }).click()
    await page
      .getByTestId('file-predictions')
      .locator('input[type="file"]')
      .setInputFiles({ name: 'predictions.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByTestId('submit-predictions').click()
    await expect(page.getByText(/^Scored \d\.\d{4}\.$/).last()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('tab', { name: 'Leaderboard' }).click()
  }

  /** The participant ids of a page's leaderboard rows, top to bottom. */
  async function ranking(page: Page): Promise<(string | null)[]> {
    const rows = page.getByTestId('leaderboard-row')
    const ids: (string | null)[] = []
    for (let index = 0; index < (await rows.count()); index++) {
      ids.push(await rows.nth(index).getAttribute('data-participant'))
    }
    return ids
  }

  test('two participants watch each other move, and the limit holds', async ({ users }) => {
    const [host, ann, ben] = await users(3)
    await host.page.goto('/home')
    const { competitionId, token } = await createCompetition(host.page, { dailyLimit: 2 })
    try {
      await Promise.all([
        ann.page.goto(`/c/${competitionId}`),
        ben.page.goto(`/c/${competitionId}`),
      ])
      for (const viewer of [ann, ben]) {
        await expect(viewer.page.getByText('No submissions yet.')).toBeVisible()
      }

      // Ann scores 2 of 6 on the public rows; Ben's open page shows her row, flashing.
      await submitThroughThePage(ann.page, SAMPLE_CSV)
      const annRowOnBen = ben.page.getByTestId('leaderboard-row')
      await expect(annRowOnBen).toHaveCount(1)
      await expect(annRowOnBen).toHaveClass(/row-flash/)
      await expect(annRowOnBen).not.toHaveAttribute('aria-current')
      const [annParticipant] = await ranking(ben.page)

      // Ben scores 1.0 and goes first on both pages.
      await submitThroughThePage(ben.page, SOLUTION_CSV)
      for (const viewer of [ann, ben]) {
        await expect(viewer.page.getByTestId('leaderboard-row')).toHaveCount(2)
        await expect(viewer.page.getByTestId('leaderboard-row').first()).toContainText('1.0000')
      }
      const [benParticipant] = await ranking(ann.page)
      expect(benParticipant).not.toBe(annParticipant)
      await expect(ann.page.getByTestId('my-rank')).toHaveText('You are 2 of 2.')

      // A screen reader is told the viewer's own rank, politely, and only theirs.
      await expect(ann.page.getByTestId('my-rank-live')).toHaveAttribute('aria-live', 'polite')
      await expect(ann.page.getByTestId('my-rank-live')).toHaveText('Your rank is 2.')
      await expect(ben.page.getByTestId('my-rank-live')).toHaveText('Your rank is 1.')

      // The viewer's own row stays in sight. On a window so short that second place is
      // below the fold, Ann still sees her row; on Ben's page the same row is out of view.
      // The cells are what sticks; the row's own box stays where the table put it.
      const annRow = (page: Page) =>
        page.getByTestId('leaderboard').locator(`[data-participant="${annParticipant}"] td`).nth(1)
      const first = await ann.page.getByTestId('leaderboard-row').first().boundingBox()
      // The window ends halfway down first place, so second place is wholly below it.
      const short = {
        width: 1280,
        height: Math.round((first?.y ?? 0) + (first?.height ?? 0) / 2),
      }
      await Promise.all([ann.page.setViewportSize(short), ben.page.setViewportSize(short)])
      await expect(annRow(ann.page)).toBeInViewport({ ratio: 0.9 })
      await expect(annRow(ben.page)).not.toBeInViewport()
      await Promise.all(
        [ann, ben].map((viewer) => viewer.page.setViewportSize({ width: 1280, height: 720 })),
      )

      // Ann ties Ben at 1.0 with her second and last submission. Ben's best came first,
      // so he keeps first place on both pages.
      await submitThroughThePage(ann.page, SOLUTION_CSV)
      for (const viewer of [ann, ben]) {
        await expect(viewer.page.getByTestId('leaderboard-row').nth(1)).toContainText('1.0000')
        expect(await ranking(viewer.page)).toEqual([benParticipant, annParticipant])
      }

      // Ann has used both of today's submissions: the page says so and the server agrees.
      await ann.page.getByRole('tab', { name: 'Submit' }).click()
      await expect(ann.page.getByTestId('submit-usage')).toHaveText(
        /^You have used all 2 submissions today\. The count resets in \d+ (h|min|s)/,
      )
      await expect(ann.page.getByTestId('submit-predictions')).toBeDisabled()
      const third = await callAction(
        ann.page,
        'submitPredictions',
        { competitionId, fileName: 'third.csv', csv: SAMPLE_CSV },
        await authToken(ann.page),
      )
      expect(third.body).toMatchObject({ success: false, code: 'limit_reached' })
    } finally {
      await removeStoredFiles(host.page, token, competitionId)
    }
  })
})
