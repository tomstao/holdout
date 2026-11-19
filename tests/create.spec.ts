/**
 * /host/new end to end: the files are checked in the browser as they are
 * chosen, Create stays disabled until they pass, and a created competition
 * opens on its own page with its data to download.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import {
  removeStoredFiles,
  SAMPLE_CSV,
  SOLUTION_CSV,
  TEST_CSV,
  TRAIN_CSV,
} from './helpers/competitions'
import { authToken } from './helpers/room'

const csv = (name: string, text: string) => ({
  name,
  mimeType: 'text/csv',
  buffer: Buffer.from(text),
})

async function choose(page: Page, kind: 'train' | 'test' | 'solution', text: string) {
  await page
    .getByTestId(`file-${kind}`)
    .locator('input[type="file"]')
    .setInputFiles(csv(`${kind}.csv`, text))
}

test('a signed-out visitor is asked to sign in', async ({ browser }) => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto('/host/new')
    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible()
    await expect(page.getByTestId('create-form')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('a host creates a competition from three files', async ({ users }, testInfo) => {
  test.skip(
    loadAllTestAccounts().length < 1,
    'Needs a test account: `npx deepspace test accounts create --email <name>@deepspace.test --password-stdin`.',
  )
  const [host] = await users(1)
  const page = host.page
  // Tall enough to hold the whole form: the app scrolls inside its shell, so a
  // full-page screenshot only captures the viewport.
  await page.setViewportSize({ width: 1100, height: 2000 })
  await page.goto('/host/new')
  await expect(page.getByRole('heading', { name: 'Create a competition', level: 1 })).toBeVisible()

  const create = page.getByTestId('create-submit')
  await expect(create).toBeDisabled()
  await expect(page.getByText('Choose the three files to continue.')).toBeVisible()

  // A solution whose last ID is not in the test file: both files say so.
  await choose(page, 'train', TRAIN_CSV)
  await choose(page, 'test', TEST_CSV)
  await choose(page, 'solution', SOLUTION_CSV.replace('t6,', 't9,'))
  await expect(page.getByTestId('file-train')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('file-train')).toContainText('Ready: 6 rows, 3 columns')
  await expect(page.getByTestId('file-test')).toContainText(
    'Row 7, id: The ID "t6" is not in solution.csv.',
  )
  await expect(page.getByTestId('file-solution')).toContainText(
    'Row 7, id: The ID "t9" is not in test.csv.',
  )
  await expect(create).toBeDisabled()
  await expect(page.getByText('Fix the problems in the files to continue.')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('host-new-problems.png'), fullPage: true })

  // The corrected file clears both.
  await choose(page, 'solution', SOLUTION_CSV)
  for (const kind of ['train', 'test', 'solution']) {
    await expect(page.getByTestId(`file-${kind}`)).toHaveAttribute('data-state', 'ready')
  }
  await expect(page.getByTestId('dataset-summary')).toContainText(
    '6 test rows: 3 public, 3 private',
  )
  await expect(page.getByTestId('dataset-summary')).toContainText(
    'Labels: Adelie, Chinstrap, Gentoo.',
  )
  // No trace of the earlier problems is left on the drop zones.
  for (const kind of ['train', 'test', 'solution']) {
    await expect(page.getByTestId(`file-${kind}`)).not.toHaveClass(/border-destructive/)
  }
  await expect(create).toBeEnabled()

  // The details are checked on Create, with the message under the field.
  await create.click()
  await expect(page.getByText('Use at least 3 characters.')).toBeVisible()
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible()
  await expect(page).toHaveURL(/\/host\/new$/)

  const title = `__test-${Date.now()}__ Palmer Penguins`
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Summary').fill('Predict the species of a penguin from its bill.')
  // An edited field drops its message.
  await expect(page.getByText('Use at least 3 characters.')).toHaveCount(0)
  await expect(page.getByText('Use at least 10 characters.')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('host-new-ready.png'), fullPage: true })
  await create.click()

  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const competitionId = page.url().split('/').pop() ?? ''
  try {
    await expect(page.getByTestId('competition-title')).toHaveText(title)
    await expect(
      page.getByText('Scored by Accuracy (higher is better) on 6 test rows.'),
    ).toBeVisible()
    const sample = await page.request.get(
      (await page.getByTestId('download-sample').getAttribute('href')) ?? '',
    )
    expect(await sample.text()).toBe(SAMPLE_CSV)
    await page.screenshot({ path: testInfo.outputPath('competition.png'), fullPage: true })
  } finally {
    const token = await authToken(page)
    if (token) await removeStoredFiles(page, token, competitionId)
  }
})

test('a competition that does not exist says so', async ({ page }) => {
  await page.goto('/c/no-such-competition')
  await expect(page.getByRole('heading', { name: 'This competition does not exist.' })).toBeVisible(
    { timeout: 15_000 },
  )
  await expect(page.getByRole('link', { name: 'All competitions' })).toHaveAttribute(
    'href',
    '/home',
  )
})
