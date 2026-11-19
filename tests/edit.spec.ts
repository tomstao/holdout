/**
 * Editing a competition (spec F5): the host changes the text and moves the
 * deadline later from the Edit tab; a participant's open page follows without
 * a reload; nobody else can edit, and a deadline never moves earlier.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import {
  callAction,
  createCompetition,
  readCompetition,
  removeStoredFiles,
} from './helpers/competitions'
import { authToken } from './helpers/room'

/** In the browser, so the string is in the time zone the input uses. */
const LOCAL_INPUT_IN_26_HOURS = `(() => {
  const date = new Date(Date.now() + 26 * 3600000)
  const pad = (value) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
})()`

test.describe('editing a competition', () => {
  test.skip(
    loadAllTestAccounts().length < 2,
    'Needs 2 test accounts (a host and a participant). Create one with ' +
      '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" --password-stdin`.',
  )

  test('the host edits the text and moves the deadline, and a participant sees it live', async ({
    users,
  }) => {
    const [host, ann] = await users(2)
    await Promise.all([host.page.goto('/home'), ann.page.goto('/home')])
    const { competitionId, token } = await createCompetition(host.page)
    try {
      const before = await readCompetition(host.page, competitionId)
      const oldDeadline = Number(before?.data.deadline)

      // A participant has no Edit tab, and the link to it opens the leaderboard.
      await ann.page.goto(`/c/${competitionId}?tab=edit`)
      await expect(ann.page.getByTestId('competition-title')).toBeVisible()
      await expect(ann.page.getByRole('tab', { name: 'Edit' })).toHaveCount(0)
      await expect(ann.page.getByTestId('edit-form')).toHaveCount(0)
      await expect(ann.page.getByTestId('countdown')).toHaveText(/^1 h \d+ min$/)

      // The host has Edit instead of Submit. Nothing to save until something changes.
      await host.page.goto(`/c/${competitionId}`)
      await expect(host.page.getByRole('tab', { name: 'Submit' })).toHaveCount(0)
      await host.page.getByRole('tab', { name: 'Edit' }).click()
      await expect(host.page).toHaveURL(/\?tab=edit$/)
      const save = host.page.getByTestId('edit-save')
      await expect(save).toBeDisabled()

      // A title that is too short is refused next to its field.
      await host.page.getByLabel('Title').fill('ab')
      await save.click()
      await expect(host.page.getByText('Use at least 3 characters.')).toBeVisible()

      // New text: saved at once, and the participant's page follows.
      const title = `__test-${Date.now()}__ Penguins, edited`
      await host.page.getByLabel('Title').fill(title)
      await expect(host.page.getByText('Use at least 3 characters.')).toHaveCount(0)
      await host.page.getByLabel('Summary').fill('A summary changed by a Playwright spec.')
      await host.page.getByLabel('Description').fill('Line one.\nLine two.')
      await save.click()
      await expect(host.page.getByText('Saved.')).toBeVisible({ timeout: 15_000 })
      await expect(host.page.getByTestId('competition-title')).toHaveText(title)
      await expect(ann.page.getByTestId('competition-title')).toHaveText(title)
      await expect(ann.page.getByText('A summary changed by a Playwright spec.')).toBeVisible()
      await expect(save).toBeDisabled()
      expect(Number((await readCompetition(host.page, competitionId))?.data.deadline)).toBe(
        oldDeadline,
      )

      // Moving the deadline asks first and names the new time.
      const later = String(await host.page.evaluate(LOCAL_INPUT_IN_26_HOURS))
      await host.page.getByLabel('Deadline').fill(later)
      await save.click()
      const dialog = host.page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'Move the deadline?' })).toBeVisible()
      await expect(dialog).toContainText(/The new deadline is \w{3} \d{1,2}, \d{4}, .+\./)
      await expect(dialog).toContainText('A deadline cannot be moved back.')
      await dialog.getByRole('button', { name: 'Move the deadline' }).click()
      await expect(host.page.getByText(/^The deadline is now /)).toBeVisible({ timeout: 15_000 })
      await expect(dialog).toHaveCount(0)

      const after = await readCompetition(host.page, competitionId)
      const newDeadline = Number(after?.data.deadline)
      expect(newDeadline).toBeGreaterThan(oldDeadline + 23 * 3_600_000)
      expect(Math.abs(newDeadline - (Date.now() + 26 * 3_600_000))).toBeLessThan(120_000)
      expect(after?.data).toMatchObject({ title, description: 'Line one.\nLine two.' })
      // The participant's countdown jumps from under two hours to over a day.
      await expect(ann.page.getByTestId('countdown')).toHaveText(/^1 d \d+ h$/)
    } finally {
      await removeStoredFiles(host.page, token, competitionId)
    }
  })

  test('only the host can edit, and a deadline never moves earlier', async ({ users }) => {
    const [host, ann] = await users(2)
    await Promise.all([host.page.goto('/home'), ann.page.goto('/home')])
    const { competitionId, token } = await createCompetition(host.page)
    try {
      const competition = await readCompetition(host.page, competitionId)
      const deadline = Number(competition?.data.deadline)
      const change = {
        competitionId,
        title: 'A title nobody should be able to set',
        summary: 'A summary nobody should be able to set.',
        description: '',
        deadline,
      }

      const stranger = await callAction(ann.page, 'updateCompetition', change, null)
      expect(stranger.response.status()).toBe(401)

      const participant = await callAction(
        ann.page,
        'updateCompetition',
        change,
        await authToken(ann.page),
      )
      expect(participant.body).toMatchObject({
        success: false,
        code: 'forbidden',
        error: 'Only the host can edit this competition.',
      })

      const earlier = await callAction(
        host.page,
        'updateCompetition',
        { ...change, deadline: deadline - 60_000 },
        token,
      )
      expect(earlier.body).toMatchObject({
        success: false,
        code: 'invalid_input',
        issues: [{ path: ['deadline'], message: 'The deadline can only move later.' }],
      })

      const unknown = await callAction(
        host.page,
        'updateCompetition',
        { ...change, competitionId: 'no-such-competition' },
        token,
      )
      expect(unknown.body).toMatchObject({ success: false, code: 'not_found' })

      // After all of that the record is as it was created.
      const unchanged = await readCompetition(host.page, competitionId)
      expect(unchanged?.data.title).toBe(competition?.data.title)
      expect(Number(unchanged?.data.deadline)).toBe(deadline)
    } finally {
      await removeStoredFiles(host.page, token, competitionId)
    }
  })
})
