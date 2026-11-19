/**
 * /home, the competition list (spec F6): what a visitor sees, and how a
 * competition moves between a viewer's sections.
 *
 * The local room keeps every competition earlier runs created, so a section
 * can be longer than it shows at first; `row` asks for the rest.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Locator, Page } from '@playwright/test'
import {
  callAction,
  createCompetition,
  removeStoredFiles,
  SOLUTION_CSV,
} from './helpers/competitions'
import { authToken } from './helpers/room'

/** The row of one competition in one section, shown in full if need be. */
async function row(page: Page, section: string, competitionId: string): Promise<Locator> {
  const within = page.getByTestId(`section-${section}`)
  await expect(within).toBeVisible()
  const showAll = within.getByRole('button', { name: /^Show all/ })
  if (await showAll.isVisible()) await showAll.click()
  return within.locator(`[data-competition="${competitionId}"]`)
}

test.describe('the competition list', () => {
  test.skip(
    loadAllTestAccounts().length < 3,
    'Needs 3 test accounts (a host, a participant and a bystander). Create one with ' +
      '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" --password-stdin`.',
  )

  test('files a competition under Hosting, Entered or Open, with its live numbers', async ({
    users,
    browser,
  }) => {
    const [host, ann, ben] = await users(3)
    await Promise.all([host.page.goto('/home'), ann.page.goto('/home'), ben.page.goto('/home')])
    const { competitionId, token } = await createCompetition(host.page, {
      summary: 'Listed on the home page by a Playwright spec.',
    })
    try {
      // The host: under Hosting, with nobody in yet and no top score.
      const hosted = await row(host.page, 'hosting', competitionId)
      await expect(hosted).toContainText('Palmer Penguins')
      await expect(hosted).toContainText('Listed on the home page by a Playwright spec.')
      await expect(hosted).toContainText('Hosted by you')
      await expect(hosted.getByTestId('row-participants')).toHaveText('0')
      await expect(hosted.getByTestId('row-top-score')).toHaveText('–')
      await expect(hosted.getByTestId('row-deadline')).toContainText(/1 h \d+ min left/)
      await expect(host.page.getByTestId('host-cta')).toHaveAttribute('href', '/host/new')

      // A participant who has not submitted: under Open, by the host's name.
      const open = await row(ann.page, 'open', competitionId)
      await expect(open).toContainText('Hosted by Alice')

      // Ann submits. Her row moves to Entered; everyone's numbers change without a reload.
      const submitted = await callAction(
        ann.page,
        'submitPredictions',
        { competitionId, fileName: 'predictions.csv', csv: SOLUTION_CSV },
        await authToken(ann.page),
      )
      expect(submitted.body.success).toBe(true)
      const entered = await row(ann.page, 'entered', competitionId)
      await expect(entered.getByTestId('row-participants')).toHaveText('1')
      await expect(entered.getByTestId('row-top-score')).toContainText('1.0000')
      await expect(entered.getByTestId('row-top-score')).toContainText('public')
      await expect(
        ann.page.getByTestId('section-open').locator(`[data-competition="${competitionId}"]`),
      ).toHaveCount(0)
      await expect(hosted.getByTestId('row-participants')).toHaveText('1')
      await expect(hosted.getByTestId('row-top-score')).toContainText('1.0000')

      // A bystander still has it under Open, and the title leads to the competition.
      const bystander = await row(ben.page, 'open', competitionId)
      await expect(bystander.getByTestId('row-participants')).toHaveText('1')
      await bystander.getByRole('link', { name: /Palmer Penguins/ }).click()
      await expect(ben.page).toHaveURL(new RegExp(`/c/${competitionId}$`))
      await expect(ben.page.getByTestId('competition-title')).toContainText('Palmer Penguins')

      // A visitor sees the same row, read-only, with a prompt to sign in.
      const context = await browser.newContext()
      const visitor = await context.newPage()
      await visitor.goto('/home')
      await expect(visitor.getByRole('heading', { level: 1, name: 'Competitions' })).toBeVisible()
      const seen = await row(visitor, 'open', competitionId)
      await expect(seen).toContainText('Hosted by Alice')
      await expect(seen.getByTestId('row-top-score')).toContainText('1.0000')
      await expect(visitor.getByTestId('section-hosting')).toHaveCount(0)
      await expect(visitor.getByTestId('section-entered')).toHaveCount(0)
      await expect(visitor.getByTestId('host-cta')).toHaveCount(0)
      await visitor.getByTestId('sign-in-prompt').getByRole('button', { name: 'Sign in' }).click()
      await expect(visitor.getByTestId('auth-overlay')).toBeVisible()
      await context.close()
    } finally {
      await removeStoredFiles(host.page, token, competitionId)
    }
  })

  test('opens the account menu from the navigation bar', async ({ users }) => {
    const [member] = await users(1)
    await member.page.goto('/home')
    await member.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(member.page.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
    await expect(member.page.getByTestId('nav-user-email')).toContainText('@')
    await member.page.getByRole('menuitem', { name: 'Settings' }).click()
    await expect(member.page).toHaveURL(/\/settings$/)
  })
})
