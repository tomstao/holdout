/**
 * The spec's acceptance criteria, walked on the deployed app with three test accounts
 * (docs/spec.md, "Acceptance criteria for v1"). Two tests, run an hour apart:
 *
 *   "walk"   criteria 1 to 4: create through the form, submit, the live board, the
 *            daily limit, and what a client is never sent.
 *   "close"  criterion 5: the same competition closes on its own and every viewer gets
 *            the final standings with the shake-up.
 *
 * It leaves ONE competition on the live site, titled as a test. Nothing deletes a
 * competition, and it stays listed for everyone. A deployed app wants a deadline at
 * least an hour ahead, so "close" waits for it; "walk" writes the competition's id and
 * deadline to a file that "close" reads.
 *
 * The two participants' files are built so the close has to move them: each is right
 * on one Adelie row only, a different one. The split keeps one row of each label on
 * either side, so whoever leads the public board with 0.3333 finishes last.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import {
  callAction,
  competitionInput,
  readCompetition,
  SOLUTION_CSV,
  TEST_CSV,
  TRAIN_CSV,
} from '../helpers/competitions'
import { authToken, recordsOf, roomExchange, subscribe } from '../helpers/room'

const STATE_FILE = process.env.HOLDOUT_LIVE_STATE ?? join(tmpdir(), 'holdout-live-acceptance.json')
const DAILY_LIMIT = 2
const MINUTE = 60_000

interface State {
  competitionId: string
  deadline: number
}

const predictions = (labels: string[]) =>
  ['id,species', ...labels.map((label, index) => `t${index + 1},${label}`), ''].join('\n')

/** Right on t1 only. */
const BEN_CSV = predictions(['Adelie', 'Adelie', 'Adelie', 'Gentoo', 'Adelie', 'Adelie'])
/** Right on t4 only. */
const CAT_CSV = predictions(['Gentoo', 'Adelie', 'Adelie', 'Adelie', 'Adelie', 'Adelie'])

const file = (name: string, text: string) => ({
  name,
  mimeType: 'text/csv',
  buffer: Buffer.from(text),
})

async function choose(page: Page, kind: 'train' | 'test' | 'solution', text: string) {
  await page
    .getByTestId(`file-${kind}`)
    .locator('input[type="file"]')
    .setInputFiles(file(`${kind}.csv`, text))
}

async function choosePredictions(page: Page, text: string) {
  await page
    .getByTestId('file-predictions')
    .locator('input[type="file"]')
    .setInputFiles(file('predictions.csv', text))
}

/** `2026-11-26T18:05`, what a `datetime-local` input takes, in this machine's time zone. */
function localInput(time: number): string {
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

const submit = (page: Page, token: string | null, competitionId: string, csv: string) =>
  callAction(page, 'submitPredictions', { competitionId, fileName: 'predictions.csv', csv }, token)

/** What the room sends this caller from the two closed collections, and from an open one. */
async function closedCollections(page: Page, token: string | null, competitionId: string) {
  const frames = await roomExchange(page, token, [
    subscribe('answer_keys'),
    subscribe('private_scores'),
    subscribe('submissions', 'submissions', { competitionId }),
  ])
  return {
    answerKeys: recordsOf(frames, 'answer_keys'),
    privateScores: recordsOf(frames, 'private_scores'),
    submissions: recordsOf(frames, 'submissions') ?? [],
  }
}

test.skip(
  loadAllTestAccounts().length < 3,
  'Needs 3 test accounts (a host and two participants). Create one with ' +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" --password-stdin`.',
)

test('walk: create, submit, the live board, the limit, the closed collections', async ({
  users,
  browser,
}, testInfo) => {
  test.setTimeout(6 * MINUTE)
  const [host, ben, cat] = await users(3)
  const visitorContext = await browser.newContext()
  try {
    // --- 1. A host creates a competition; three bad files each say where. ---
    const page = host.page
    await page.setViewportSize({ width: 1100, height: 2000 })
    await page.goto('/host/new')
    await expect(page.getByRole('heading', { name: 'Create a competition' })).toBeVisible({
      timeout: 20_000,
    })
    const create = page.getByTestId('create-submit')
    await choose(page, 'train', TRAIN_CSV.replace('a3,38.2,Adelie', 'a3,38.2,'))
    await choose(page, 'test', TEST_CSV.replace('t5,46.0', 't2,46.0'))
    await choose(page, 'solution', SOLUTION_CSV.replace('t6,Chinstrap', 't6,'))
    await expect(page.getByTestId('file-train')).toContainText(
      'Row 4, species: The target is empty.',
    )
    await expect(page.getByTestId('file-test')).toContainText(
      'Row 6, id: The ID "t2" is already used in row 3.',
    )
    await expect(page.getByTestId('file-solution')).toContainText(
      'Row 7, species: The target is empty.',
    )
    await expect(create).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('1-problems.png') })

    // The server says the same of a bad file sent past the form, and creates nothing.
    const hostToken = await authToken(page)
    const refusedCreate = await callAction(
      page,
      'createCompetition',
      competitionInput({
        title: '[TEST] A file the server must refuse',
        files: {
          train: { name: 'train.csv', csv: TRAIN_CSV },
          test: { name: 'test.csv', csv: TEST_CSV },
          solution: { name: 'solution.csv', csv: SOLUTION_CSV.replace('t6,Chinstrap', 't6,') },
        },
      }),
      hostToken,
    )
    expect(refusedCreate.body).toMatchObject({ success: false, code: 'invalid_file' })
    expect(refusedCreate.body.issues).toContainEqual({
      path: ['solution', 'row 7', 'species'],
      message: 'The target is empty.',
    })

    await choose(page, 'train', TRAIN_CSV)
    await choose(page, 'test', TEST_CSV)
    await choose(page, 'solution', SOLUTION_CSV)
    for (const kind of ['train', 'test', 'solution']) {
      await expect(page.getByTestId(`file-${kind}`)).toHaveAttribute('data-state', 'ready')
    }
    await expect(page.getByTestId('dataset-summary')).toContainText(
      '6 test rows: 3 public, 3 private',
    )

    const title = `[TEST] Acceptance walk-through ${new Date().toISOString().slice(0, 16)}Z`
    await page.getByLabel('Title').fill(title)
    await page
      .getByLabel('Summary')
      .fill('A test of the app itself. Not a real competition; please ignore it.')
    await page
      .getByLabel('Description')
      .fill(
        'Created by the acceptance walk-through on the live site.\n' +
          'It has six rows and closes an hour after it was made. Nothing here is real.',
      )
    // A deployed app wants at least an hour. 63 minutes, cut to the minute, leaves 62.
    await page.getByLabel('Deadline').fill(localInput(Date.now() + 63 * MINUTE))
    await page.getByLabel('Submissions per day').fill(String(DAILY_LIMIT))
    await page.screenshot({ path: testInfo.outputPath('1-ready.png') })
    await create.click()

    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: 45_000 })
    const competitionId = page.url().split('/').pop() ?? ''
    const url = `/c/${competitionId}`
    await expect(page.getByTestId('competition-title')).toHaveText(title)
    await expect(page.getByRole('tab', { name: 'Submit' })).toHaveCount(0)

    const stored = await readCompetition(page, competitionId)
    const state: State = { competitionId, deadline: Number(stored?.data.deadline) }
    expect(state.deadline - Date.now()).toBeGreaterThan(60 * MINUTE)
    // Written now: whatever fails below, the competition exists and will close.
    writeFileSync(STATE_FILE, JSON.stringify(state))
    console.log(`[live] ${title}: ${url}, closes ${new Date(state.deadline).toISOString()}`)

    // --- A visitor: open, counting down, empty, with the data to download. ---
    const visitor = await visitorContext.newPage()
    await visitor.goto(url)
    await expect(visitor.getByTestId('competition-status')).toHaveText('Open', { timeout: 20_000 })
    await expect(visitor.getByTestId('countdown')).toHaveText(/^1 h \d+ min$/)
    await expect(visitor.getByText('No submissions yet.')).toBeVisible()
    await visitor.getByRole('tab', { name: 'Data' }).click()
    for (const kind of ['train', 'test', 'sample']) {
      const href = (await visitor.getByTestId(`download-${kind}`).getAttribute('href')) ?? ''
      expect((await visitor.request.get(href)).status(), kind).toBe(200)
    }
    await visitor.getByRole('tab', { name: 'Leaderboard' }).click()

    // --- 2 and 3. A participant: a bad file, a score, and the board on another screen. ---
    await ben.page.goto(url)
    await expect(ben.page.getByText('No submissions yet.')).toBeVisible({ timeout: 20_000 })

    const [benToken, catToken] = await Promise.all([authToken(ben.page), authToken(cat.page)])
    await cat.page.setViewportSize({ width: 1100, height: 1600 })
    await cat.page.goto(`${url}?tab=submit`)
    const usage = cat.page.getByTestId('submit-usage')
    await expect(usage).toContainText(`0 of ${DAILY_LIMIT} submissions used today`, {
      timeout: 20_000,
    })
    const send = cat.page.getByTestId('submit-predictions')

    // The form catches a bad file before it is sent.
    const bad = CAT_CSV.replace('t2,Adelie', 't2,Emperor')
    await choosePredictions(cat.page, bad)
    await expect(cat.page.getByTestId('file-predictions')).toContainText(
      'Row 3, species: "Emperor" is not one of the labels: Adelie, Chinstrap, Gentoo.',
    )
    await expect(send).toBeDisabled()
    // Sent past the form, the server refuses it with the same problem and uses no slot.
    const refused = await submit(cat.page, catToken, competitionId, bad)
    expect(refused.body).toMatchObject({ success: false, code: 'invalid_file' })
    expect(refused.body.issues).toEqual([
      {
        path: ['row 3', 'species'],
        message: '"Emperor" is not one of the labels: Adelie, Chinstrap, Gentoo.',
      },
    ])
    await cat.page.reload()
    await expect(usage).toContainText(`0 of ${DAILY_LIMIT} submissions used today`, {
      timeout: 20_000,
    })

    // A valid file is scored, and the other participant's open page shows the row.
    await choosePredictions(cat.page, CAT_CSV)
    await expect(cat.page.getByTestId('file-predictions')).toContainText('Ready: 6 rows')
    await send.click()
    const scored = cat.page.getByText(/^Scored 0\.\d{4}\.$/)
    await expect(scored).toBeVisible({ timeout: 20_000 })
    const catPublic = /0\.\d{4}/.exec(await scored.innerText())?.[0] ?? ''
    expect(['0.0000', '0.3333']).toContain(catPublic)
    await expect(usage).toContainText(`1 of ${DAILY_LIMIT} submissions used today`)
    await cat.page.screenshot({ path: testInfo.outputPath('2-scored.png') })

    for (const viewer of [ben.page, visitor]) {
      await expect(viewer.getByTestId('leaderboard-row')).toHaveCount(1, { timeout: 15_000 })
      await expect(viewer.getByTestId('leaderboard-row')).toContainText(catPublic)
    }

    // The answer to a submission: these five fields, and no private score among them.
    const second = await submit(cat.page, catToken, competitionId, CAT_CSV)
    expect(second.body).toMatchObject({
      success: true,
      data: { slot: 2, dailyLimit: DAILY_LIMIT },
    })
    expect(Object.keys(second.body.data ?? {}).sort()).toEqual([
      'dailyLimit',
      'publicScore',
      'resetsAt',
      'slot',
      'submissionId',
    ])

    // The limit: the next valid file is refused, with the time the count resets.
    const third = await submit(cat.page, catToken, competitionId, CAT_CSV)
    expect(third.body).toMatchObject({
      success: false,
      code: 'limit_reached',
      error: `You have used all ${DAILY_LIMIT} submissions for today. The count resets at 00:00 UTC.`,
    })
    await expect(usage).toHaveText(
      new RegExp(
        `^You have used all ${DAILY_LIMIT} submissions today\\. The count resets in \\d+ (h|min|s)`,
      ),
      { timeout: 15_000 },
    )
    await expect(send).toBeDisabled()
    await cat.page.screenshot({ path: testInfo.outputPath('3-limit.png') })

    // The second participant, through the form; the first one's board moves.
    await cat.page.getByRole('tab', { name: 'Leaderboard' }).click()
    await ben.page.getByRole('tab', { name: 'Submit' }).click()
    await choosePredictions(ben.page, BEN_CSV)
    await ben.page.getByTestId('submit-predictions').click()
    const benScored = ben.page.getByText(/^Scored 0\.\d{4}\.$/)
    await expect(benScored).toBeVisible({ timeout: 20_000 })
    const benPublic = /0\.\d{4}/.exec(await benScored.innerText())?.[0] ?? ''
    // One of them holds the public Adelie row, the other does not.
    expect([benPublic, catPublic].sort()).toEqual(['0.0000', '0.3333'])
    for (const viewer of [cat.page, visitor]) {
      await expect(viewer.getByTestId('leaderboard-row')).toHaveCount(2, { timeout: 15_000 })
      await expect(viewer.getByTestId('leaderboard-row').first()).toContainText('0.3333')
    }
    await cat.page.screenshot({ path: testInfo.outputPath('2-board.png') })

    // The host may not submit to their own competition.
    expect((await submit(page, hostToken, competitionId, BEN_CSV)).body).toMatchObject({
      success: false,
      code: 'forbidden',
    })

    // --- 4. Nobody is sent the answer key or a private score. ---
    // Rows exist by now (one key, three private scores), so "nothing" means refused.
    for (const [who, viewer, token] of [
      ['a visitor', visitor, null],
      ['a participant', cat.page, catToken],
      ['the other participant', ben.page, benToken],
      ['the host', page, hostToken],
    ] as const) {
      const sent = await closedCollections(viewer, token, competitionId)
      expect(sent.answerKeys ?? [], `answer_keys, ${who}`).toEqual([])
      expect(sent.privateScores ?? [], `private_scores, ${who}`).toEqual([])
      // The same socket does deliver what is public, so the silence above is a refusal.
      expect(sent.submissions, `submissions, ${who}`).toHaveLength(3)
    }
    // The agent tools are not served at all.
    const tools = await cat.page.request.post('/_deepspace/agent/browser/tools/records_query', {
      headers: { Authorization: `Bearer ${catToken ?? ''}` },
      data: { collection: 'answer_keys' },
    })
    expect(tools.status()).toBe(404)
  } finally {
    await visitorContext.close()
  }
})

test('close: the competition closes on its own; every viewer gets the final standings', async ({
  users,
  browser,
}, testInfo) => {
  test.skip(!existsSync(STATE_FILE), `Run "walk" first: it writes ${STATE_FILE}.`)
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State
  const url = `/c/${state.competitionId}`
  const untilDeadline = Math.max(0, state.deadline - Date.now())
  test.setTimeout(untilDeadline + 12 * MINUTE)

  // Be on the page a minute and a half before the deadline, and watch it pass.
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, untilDeadline - 90_000)))
  const [host, ben, cat] = await users(3)
  const visitorContext = await browser.newContext()
  try {
    await ben.page.goto(url)
    const status = ben.page.getByTestId('competition-status')
    await expect(status).toHaveText(/Open|Closing|Closed/, { timeout: 20_000 })
    const watched = (await status.innerText()) === 'Open'
    if (watched) await expect(ben.page.getByTestId('leaderboard-row')).toHaveCount(2)
    const leader = (await ben.page.getByTestId('leaderboard-row').first().innerText()).replace(
      /\s+/g,
      ' ',
    )

    // The deadline passes with the page open: no reload from here on.
    await expect(status).toHaveText(/Closing|Closed/, { timeout: untilDeadline + 2 * MINUTE })
    const benToken = await authToken(ben.page)
    const late = await submit(ben.page, benToken, state.competitionId, BEN_CSV)
    expect(late.body).toMatchObject({ success: false, code: 'closed' })

    await expect(status).toHaveText('Closed', { timeout: 6 * MINUTE })
    const seenClosed = Date.now()
    const finals = ben.page.getByTestId('final-row')
    await expect(finals).toHaveCount(2)
    await expect(finals.first()).toContainText('0.3333')
    await expect(finals.nth(1)).toContainText('0.0000')
    // The public leader held the public Adelie row and nothing else: they finish last.
    await expect(finals.first().getByLabel('Up 1 place')).toBeVisible()
    await expect(finals.nth(1).getByLabel('Down 1 place')).toBeVisible()
    await expect(ben.page.getByTestId('my-final-rank')).toHaveText(/^You finished [12] of 2\.$/)
    await ben.page.screenshot({ path: testInfo.outputPath('5-final-watched.png') })

    // Every other viewer, arriving after the close, gets the same standings.
    const visitor = await visitorContext.newPage()
    for (const [who, viewer] of [
      ['a visitor', visitor],
      ['the other participant', cat.page],
      ['the host', host.page],
    ] as const) {
      await viewer.goto(url)
      await expect(viewer.getByTestId('competition-status'), who).toHaveText('Closed', {
        timeout: 20_000,
      })
      const rows = viewer.getByTestId('final-row')
      await expect(rows, who).toHaveCount(2)
      await expect(rows.first().getByLabel('Up 1 place'), who).toBeVisible()
      await expect(rows.nth(1).getByLabel('Down 1 place'), who).toBeVisible()
    }
    await visitor.screenshot({ path: testInfo.outputPath('5-final-visitor.png') })

    // The public board as it stood is one click away, with the other order.
    await visitor.getByRole('button', { name: 'Public leaderboard' }).click()
    await expect(visitor.getByTestId('leaderboard-row')).toHaveCount(2)
    await expect(visitor.getByTestId('leaderboard-row').first()).toContainText('0.3333')

    // What the room holds, as a visitor is sent it; the private scores stay closed.
    const competition = await readCompetition(visitor, state.competitionId)
    expect(competition?.data.status).toBe('closed')
    const closedAt = Number(competition?.data.closedAt)
    expect(closedAt).toBeGreaterThan(state.deadline)
    const frames = await roomExchange(visitor, null, [
      subscribe('final_standings', 'standings', { competitionId: state.competitionId }),
      subscribe('private_scores'),
      subscribe('answer_keys'),
    ])
    const standings = (recordsOf(frames, 'standings') ?? []) as {
      data: { rank: number; submissionCount: number }
    }[]
    expect(standings.map((row) => row.data.rank).sort()).toEqual([1, 2])
    expect(standings.map((row) => row.data.submissionCount).sort()).toEqual([1, 2])
    expect(recordsOf(frames, 'private_scores') ?? []).toEqual([])
    expect(recordsOf(frames, 'answer_keys') ?? []).toEqual([])
    const catToken = await authToken(cat.page)
    const own = await closedCollections(cat.page, catToken, state.competitionId)
    expect(own.privateScores ?? []).toEqual([])
    expect(own.answerKeys ?? []).toEqual([])

    console.log(
      `[live] closed ${String(Math.round((closedAt - state.deadline) / 1000))} s after the deadline` +
        ` (seen on the open page ${String(Math.round((seenClosed - state.deadline) / 1000))} s after);` +
        ` watched from Open: ${String(watched)}; public leader before: ${leader}`,
    )
  } finally {
    await visitorContext.close()
  }
})
