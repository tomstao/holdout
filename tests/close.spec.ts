/**
 * The close (spec F4): a competition whose deadline passes is closed by the
 * cron task and its job, with nobody doing anything. The page says so while
 * it happens and then shows the final standings.
 *
 * It takes about two minutes: the task runs once a minute. A local test may
 * create a competition due in seconds; a deployed app wants an hour
 * (src/actions/host-files.ts).
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import {
  callAction,
  createCompetition,
  readCompetition,
  removeStoredFiles,
  SAMPLE_CSV,
  SOLUTION_CSV,
} from './helpers/competitions'
import { authToken, recordsOf, roomExchange, subscribe } from './helpers/room'

test.skip(
  loadAllTestAccounts().length < 3,
  'Needs 3 test accounts (a host and two participants). Create one with ' +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" --password-stdin`.',
)

test('a competition closes on its own and shows the final standings', async ({
  users,
}, testInfo) => {
  test.setTimeout(300_000)
  const [host, ann, ben] = await users(3)
  await Promise.all([host.page.goto('/home'), ann.page.goto('/home'), ben.page.goto('/home')])
  const { competitionId, token } = await createCompetition(host.page, {
    deadline: Date.now() + 45_000,
  })
  try {
    const [annToken, benToken] = await Promise.all([authToken(ann.page), authToken(ben.page)])
    const submit = (page: typeof ann.page, who: string | null, csv: string) =>
      callAction(
        page,
        'submitPredictions',
        { competitionId, fileName: 'predictions.csv', csv },
        who,
      )

    // Ann: a weak file, then a perfect one. Ben: the weak file only.
    expect((await submit(ann.page, annToken, SAMPLE_CSV)).body.success).toBe(true)
    expect((await submit(ann.page, annToken, SOLUTION_CSV)).body.success).toBe(true)
    expect((await submit(ben.page, benToken, SAMPLE_CSV)).body.success).toBe(true)

    await ann.page.goto(`/c/${competitionId}`)
    await expect(ann.page.getByTestId('competition-status')).toHaveText('Open')
    await expect(ann.page.getByTestId('leaderboard-row')).toHaveCount(2)

    // The deadline passes while the page is open: it says so without a reload.
    await expect(ann.page.getByTestId('competition-status')).toHaveText('Closing', {
      timeout: 60_000,
    })
    await expect(ann.page.getByTestId('closing-notice')).toContainText(
      'Deadline passed. Final standings are being computed.',
    )
    const late = await submit(ben.page, benToken, SOLUTION_CSV)
    expect(late.body).toMatchObject({ success: false, code: 'closed' })

    // Within about two minutes the cron task and the job have closed it.
    await expect(ann.page.getByTestId('competition-status')).toHaveText('Closed', {
      timeout: 180_000,
    })
    const rows = ann.page.getByTestId('final-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
    await expect(rows.first()).toContainText('1.0000')
    await expect(ann.page.getByTestId('my-final-rank')).toHaveText('You finished 1 of 2.')
    await expect(ann.page.getByTestId('closing-notice')).toHaveCount(0)
    await ann.page.screenshot({ path: testInfo.outputPath('final-standings.png') })

    // The public leaderboard as it stood is one click away.
    await ann.page.getByRole('button', { name: 'Public leaderboard' }).click()
    await expect(ann.page.getByTestId('leaderboard-row')).toHaveCount(2)
    await expect(
      ann.page.getByText('The public leaderboard as it stood at the deadline.'),
    ).toBeVisible()

    // Ann's submissions now show the private score of the ones that counted.
    await ann.page.getByRole('tab', { name: 'Submit' }).click()
    await expect(ann.page.getByTestId('submit-closed')).toContainText(
      'This competition has closed.',
    )
    const mine = ann.page.getByTestId('my-submissions')
    await expect(mine.locator('thead')).toContainText('Private score')
    await expect(mine.locator('tbody tr')).toHaveCount(2)
    await expect(mine.locator('tbody tr').first()).toContainText('1.0000')

    // What the room now holds, as a signed-out visitor is sent it.
    const competition = await readCompetition(ann.page, competitionId)
    expect(competition?.data.status).toBe('closed')
    expect(Number(competition?.data.closedAt)).toBeGreaterThan(Number(competition?.data.deadline))
    const frames = await roomExchange(ann.page, null, [
      subscribe('final_standings', 'standings', { competitionId }),
      subscribe('private_scores'),
    ])
    const standings = (recordsOf(frames, 'standings') ?? []) as {
      recordId: string
      data: { rank: number; finalScore: number; chosen: unknown[]; submissionCount: number }
    }[]
    expect(standings.map((row) => row.data.rank).sort()).toEqual([1, 2])
    const winner = standings.find((row) => row.data.rank === 1)
    expect(winner?.data).toMatchObject({ finalScore: 1, submissionCount: 2 })
    expect(winner?.data.chosen).toHaveLength(2)
    expect(winner?.recordId.startsWith(`${competitionId}:`)).toBe(true)
    // The private scores themselves stay closed, after the close too.
    expect(recordsOf(frames, 'private_scores')).toEqual([])
  } finally {
    await removeStoredFiles(host.page, token, competitionId)
  }
})
