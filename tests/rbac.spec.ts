/**
 * The record room's permissions, asked for directly over its WebSocket: what
 * a signed-out visitor and a signed-in member may write (nothing) and what
 * the two closed collections send them (nothing).
 *
 * The room answers an empty collection and a closed one the same way, with no
 * records, so the last test first creates a competition through the real
 * action and only then looks for its answer key.
 *
 * What no client can show is that the answer key is there at all: that is the
 * point of a closed collection. The unit test of createCompetition covers the
 * write, and scoring a submission against the key will cover it end to end
 * (docs/plan.md, PR 8).
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import {
  callAction,
  competitionInput,
  readCompetition,
  removeStoredFiles,
} from './helpers/competitions'
import { ackOf, authToken, put, recordsOf, remove, roomExchange, subscribe } from './helpers/room'

const id = `__test-${Date.now()}__`
const file = (name: string) => ({ key: `${id}/${name}`, name, bytes: 1 })

/** One complete, valid record per collection, so a refusal can only be about permission. */
const RECORDS: Record<string, object> = {
  competitions: {
    title: `${id} competition`,
    summary: 'A record no client is allowed to create.',
    description: '',
    taskType: 'classification',
    metric: 'accuracy',
    idColumn: 'id',
    targetColumn: 'label',
    labels: ['a', 'b'],
    deadline: Date.now() + 3_600_000,
    dailyLimit: 5,
    scoreDecimals: 4,
    testRows: 2,
    publicRows: 1,
    privateRows: 1,
    status: 'open',
    hostId: 'someone',
    hostName: 'Someone',
    files: { train: file('train.csv'), test: file('test.csv'), sample: file('sample.csv') },
  },
  answer_keys: {
    competitionId: id,
    rows: [
      ['1', 'a', 'public'],
      ['2', 'b', 'private'],
    ],
    rowCount: 2,
  },
  submissions: {
    competitionId: id,
    participantId: 'someone',
    participantName: 'Someone',
    fileName: 'predictions.csv',
    utcDay: '2026-11-19',
    slot: 1,
    publicScore: 1,
    rowCount: 2,
  },
  private_scores: {
    submissionId: id,
    competitionId: id,
    participantId: 'someone',
    privateScore: 1,
  },
  final_standings: {
    competitionId: id,
    participantId: 'someone',
    participantName: 'Someone',
    rank: 1,
    finalScore: 1,
    publicRank: 1,
    publicScore: 1,
    submissionCount: 1,
    chosen: [{ submissionId: id, publicScore: 1, privateScore: 1 }],
  },
}
const COLLECTIONS = Object.keys(RECORDS)
const CLOSED = ['answer_keys', 'private_scores']
const PUBLIC = COLLECTIONS.filter((collection) => !CLOSED.includes(collection))

const NEEDS_ACCOUNTS =
  'Create test accounts with `npx deepspace test accounts create --email <name>@deepspace.test --password-stdin`.'

/** Try to create one record in every collection, then read every collection back. */
async function expectNoAccess(page: Page, token: string | null, role: string) {
  const writes = await roomExchange(
    page,
    token,
    COLLECTIONS.map((collection) => put(collection, id, RECORDS[collection] ?? {})),
  )
  expect(writes.find((frame) => frame.type === 'user.info')?.payload?.role).toBe(role)
  for (const collection of COLLECTIONS) {
    expect(ackOf(writes, collection, id), collection).toMatchObject({
      success: false,
      error: `CREATE DENIED: role=${role}, collection=${collection}`,
    })
  }

  const reads = await roomExchange(
    page,
    token,
    COLLECTIONS.map((collection) => subscribe(collection)),
  )
  for (const collection of CLOSED) {
    expect(recordsOf(reads, collection), collection).toEqual([])
  }
  for (const collection of PUBLIC) {
    // The room answered, and the refused record is not there.
    const records = recordsOf(reads, collection) as { recordId: string }[] | undefined
    expect(records, collection).toBeDefined()
    expect(
      records?.map((record) => record.recordId),
      collection,
    ).not.toContain(id)
  }
}

test('a signed-out visitor can write nothing and is sent no closed rows', async ({ browser }) => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto('/home')
    await expectNoAccess(page, null, 'viewer')
  } finally {
    await context.close()
  }
})

test('a signed-in member can write nothing and is sent no closed rows', async ({ users }) => {
  test.skip(loadAllTestAccounts().length < 1, `Needs a test account. ${NEEDS_ACCOUNTS}`)
  const [member] = await users(1)
  await member.page.goto('/home')
  const token = await authToken(member.page)
  expect(token, 'the member has a token').not.toBeNull()
  await expectNoAccess(member.page, token, 'member')
})

test('once a competition exists, nobody is sent its answer key or may change it', async ({
  users,
  browser,
}) => {
  test.skip(loadAllTestAccounts().length < 2, `Needs two test accounts. ${NEEDS_ACCOUNTS}`)
  const [host, other] = await users(2)
  await Promise.all([host.page.goto('/home'), other.page.goto('/home')])
  const hostToken = await authToken(host.page)

  // The action answers with the new id and nothing else.
  const { body } = await callAction(host.page, 'createCompetition', competitionInput(), hostToken)
  expect(body.success).toBe(true)
  expect(Object.keys(body.data ?? {})).toEqual(['competitionId'])
  const competitionId = String(body.data?.competitionId)

  const context = await browser.newContext()
  try {
    const visitor = await context.newPage()
    await visitor.goto('/home')
    const otherToken = await authToken(other.page)

    // Reads: the visitor, another member and the host herself.
    const readers: [string, Page, string | null][] = [
      ['visitor', visitor, null],
      ['another member', other.page, otherToken],
      ['the host', host.page, hostToken],
    ]
    for (const [who, page, token] of readers) {
      const frames = await roomExchange(page, token, [
        subscribe('answer_keys'),
        subscribe('answer_keys', 'by-id', { competitionId }),
        subscribe('private_scores'),
        subscribe('competitions'),
      ])
      expect(recordsOf(frames, 'answer_keys'), who).toEqual([])
      expect(recordsOf(frames, 'by-id'), who).toEqual([])
      expect(recordsOf(frames, 'private_scores'), who).toEqual([])
      // The same socket does deliver the public record, so the silence above is a refusal.
      const competitions = recordsOf(frames, 'competitions') as { recordId: string }[]
      expect(
        competitions.map((record) => record.recordId),
        who,
      ).toContain(competitionId)
    }

    // Writes on rows that exist: another member, and the host outside her actions.
    const before = await readCompetition(visitor, competitionId)
    const writers: [string, Page, string | null][] = [
      ['another member', other.page, otherToken],
      ['the host', host.page, hostToken],
    ]
    for (const [who, page, token] of writers) {
      const frames = await roomExchange(page, token, [
        put('competitions', competitionId, { title: `${id} taken over`, status: 'closed' }),
        put('answer_keys', competitionId, { rowCount: 0 }),
        remove('answer_keys', competitionId),
        remove('competitions', competitionId),
      ])
      const refusals = frames.filter((frame) => frame.type === 'records.ack')
      expect(refusals, who).toHaveLength(4)
      for (const refusal of refusals) {
        expect(refusal.payload, who).toMatchObject({ success: false })
        expect(String(refusal.payload?.error), who).toContain('DENIED')
      }
    }
    expect(await readCompetition(visitor, competitionId)).toEqual(before)

    // Guessing: the room must answer a right guess and a wrong one alike. It
    // checks `immutable` columns before permission, so a closed collection
    // that declared one would answer `UPDATE DENIED` only to the right guess
    // (src/schemas/permissions.ts). The key has 6 rows.
    const guesses: object[] = [
      { rowCount: 6 },
      { rowCount: 5 },
      { competitionId },
      { competitionId: 'another' },
      { rows: [] },
      {},
    ]
    for (const guess of guesses) {
      const frames = await roomExchange(other.page, otherToken, [
        put('answer_keys', competitionId, guess),
      ])
      expect(ackOf(frames, 'answer_keys', competitionId), JSON.stringify(guess)).toMatchObject({
        success: false,
        error: 'UPDATE DENIED: role=member, collection=answer_keys',
      })
    }
  } finally {
    await context.close()
    if (hostToken) await removeStoredFiles(host.page, hostToken, competitionId)
  }
})
