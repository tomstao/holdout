/**
 * /c/:id for a visitor, a participant and the host: the tabs, the data, the
 * local check of a predictions file, a scored submission and the leaderboard
 * row it makes. Two browsers watching each other live are in collab.spec.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import {
  createCompetition,
  removeStoredFiles,
  SAMPLE_CSV,
  SOLUTION_CSV,
} from './helpers/competitions'

test.skip(
  loadAllTestAccounts().length < 2,
  'Needs two test accounts: `npx deepspace test accounts create --email <name>@deepspace.test --password-stdin`.',
)

const csv = (text: string) => ({
  name: 'predictions.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(text),
})

async function choosePredictions(page: Page, text: string) {
  await page.getByTestId('file-predictions').locator('input[type="file"]').setInputFiles(csv(text))
}

test('a visitor, a participant and the host each see their own page', async ({
  users,
  browser,
}, testInfo) => {
  const [host, participant] = await users(2)
  await host.page.goto('/home')
  const { competitionId, token } = await createCompetition(host.page, { dailyLimit: 3 })
  const url = `/c/${competitionId}`
  const visitorContext = await browser.newContext()
  try {
    // --- A visitor: an empty board, the data, and an invitation to sign in. ---
    const visitor = await visitorContext.newPage()
    await visitor.setViewportSize({ width: 1100, height: 1400 })
    await visitor.goto(url)
    await expect(visitor.getByTestId('competition-status')).toHaveText('Open')
    await expect(visitor.getByTestId('countdown')).toHaveText(/^1 h \d+ min$/)
    await expect(visitor.getByText('No submissions yet.')).toBeVisible()

    await visitor.getByRole('tab', { name: 'Overview' }).click()
    await expect(
      visitor.getByText('Accuracy: the share of rows you predict exactly right.'),
    ).toBeVisible()
    await expect(visitor.getByText(/Up to 3\s+submissions per day/)).toBeVisible()

    await visitor.getByRole('tab', { name: 'Data' }).click()
    await expect(visitor.getByTestId('sample-preview').locator('tbody tr')).toHaveCount(5)
    const sample = await visitor.request.get(
      (await visitor.getByTestId('download-sample').getAttribute('href')) ?? '',
    )
    expect(await sample.text()).toBe(SAMPLE_CSV)

    await visitor.getByRole('tab', { name: 'Submit' }).click()
    await expect(visitor).toHaveURL(/\?tab=submit$/)
    await expect(visitor.getByText('Sign in to submit predictions.')).toBeVisible()

    // --- The participant: a bad file is caught before it is sent, a good one is scored. ---
    const page = participant.page
    await page.setViewportSize({ width: 1100, height: 1600 })
    await page.goto(`${url}?tab=submit`)
    await expect(page.getByTestId('submit-usage')).toContainText('0 of 3 submissions used today')
    const submit = page.getByTestId('submit-predictions')
    await expect(submit).toBeDisabled()

    await choosePredictions(page, SAMPLE_CSV.replace('t2,Adelie', 't2,Emperor'))
    await expect(page.getByTestId('file-predictions')).toContainText(
      'Row 3, species: "Emperor" is not one of the labels: Adelie, Chinstrap, Gentoo.',
    )
    await expect(submit).toBeDisabled()

    await choosePredictions(page, SAMPLE_CSV)
    await expect(page.getByTestId('file-predictions')).toContainText('Ready: 6 rows')
    await submit.click()
    await expect(page.getByText(/^Scored 0\.\d{4}\.$/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('submit-usage')).toContainText('1 of 3 submissions used today')

    await choosePredictions(page, SOLUTION_CSV)
    await submit.click()
    await expect(page.getByText('Scored 1.0000.')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('my-submissions').locator('tbody tr')).toHaveCount(2)
    await expect(page.getByTestId('my-submissions')).toContainText('Best1.0000')
    await page.screenshot({ path: testInfo.outputPath('submit.png') })

    await page.getByRole('tab', { name: 'Leaderboard' }).click()
    const mine = page.getByTestId('leaderboard-row')
    await expect(mine).toHaveCount(1)
    await expect(mine).toHaveAttribute('aria-current', 'true')
    await expect(mine).toContainText('1.0000')
    await expect(page.getByTestId('my-rank')).toHaveText('You are 1 of 1.')
    await page.screenshot({ path: testInfo.outputPath('leaderboard.png') })

    // --- The visitor's open page caught up without a reload. ---
    await visitor.getByRole('tab', { name: 'Leaderboard' }).click()
    await expect(visitor.getByTestId('leaderboard-row')).toHaveCount(1)
    await expect(visitor.getByTestId('leaderboard-row')).toContainText('1.0000')
    await expect(visitor.getByTestId('leaderboard-row')).not.toHaveAttribute('aria-current')

    // --- The host: no Submit tab, even when the link asks for it. ---
    await host.page.goto(`${url}?tab=submit`)
    await expect(host.page.getByTestId('leaderboard')).toBeVisible()
    await expect(host.page.getByRole('tab', { name: 'Submit' })).toHaveCount(0)
  } finally {
    await visitorContext.close()
    await removeStoredFiles(host.page, token, competitionId)
  }
})
