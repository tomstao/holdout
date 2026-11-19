/**
 * The demo competition's files (spec F8, scripts/demo/) go through the real
 * create action, and its answers score as a perfect submission: what the
 * owner will do by hand on the deployed app, done here against the local one.
 */
import { readFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { ID_COLUMN, makeDemo, TARGET_COLUMN } from '../scripts/demo/demo'
import {
  callAction,
  createCompetition,
  readCompetition,
  removeStoredFiles,
} from './helpers/competitions'
import { authToken } from './helpers/room'

test.skip(
  loadAllTestAccounts().length < 2,
  'Needs 2 test accounts (a host and a participant). Create one with ' +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" --password-stdin`.',
)

test('the demo files make a competition, and its answers score 1.0000', async ({ users }) => {
  const source = readFileSync(new URL('../scripts/demo/penguins.csv', import.meta.url), 'utf8')
  // Any seed: this run's files are made here and never leave the test.
  const demo = makeDemo(source, Date.now() % 1_000_000)

  const [host, participant] = await users(2)
  await Promise.all([host.page.goto('/home'), participant.page.goto('/home')])
  const { competitionId, token } = await createCompetition(host.page, {
    title: `__test-${Date.now()}__ Palmer Penguins (practice)`,
    summary: "Predict a penguin's species from its measurements. Practice: the labels are public.",
    idColumn: ID_COLUMN,
    targetColumn: TARGET_COLUMN,
    files: {
      train: { name: 'train.csv', csv: demo.train },
      test: { name: 'test.csv', csv: demo.test },
      solution: { name: 'solution.csv', csv: demo.solution },
    },
  })
  try {
    const competition = await readCompetition(host.page, competitionId)
    expect(competition?.data).toMatchObject({
      labels: ['Adelie', 'Chinstrap', 'Gentoo'],
      testRows: 136,
      status: 'open',
    })
    // The default public share is 30%, split within each species.
    expect(Number(competition?.data.publicRows)).toBeGreaterThanOrEqual(38)
    expect(Number(competition?.data.publicRows)).toBeLessThanOrEqual(44)
    expect(Number(competition?.data.publicRows) + Number(competition?.data.privateRows)).toBe(136)

    // The sample submission the app wrote is a valid entry: every row the commonest label.
    const submit = async (csv: string) =>
      callAction(
        participant.page,
        'submitPredictions',
        { competitionId, fileName: 'predictions.csv', csv },
        await authToken(participant.page),
      )
    const sample = await host.page.request.get(`/api/competitions/${competitionId}/files/sample`)
    expect(sample.ok()).toBe(true)
    const baseline = await submit(await sample.text())
    expect(baseline.body.success).toBe(true)
    const baselineScore = Number(baseline.body.data?.publicScore)
    expect(baselineScore).toBeGreaterThan(0.3)
    expect(baselineScore).toBeLessThan(0.6)

    const perfect = await submit(demo.solution)
    expect(perfect.body).toMatchObject({ success: true, data: { publicScore: 1 } })
  } finally {
    await removeStoredFiles(host.page, token, competitionId)
  }
})
