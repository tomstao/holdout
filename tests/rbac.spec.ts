/**
 * The record room's permissions, asked for directly over its WebSocket: what
 * a signed-out visitor and a signed-in member may write (nothing) and what
 * the two closed collections send them (nothing).
 *
 * The room answers an empty collection and a closed one the same way, with no
 * records. So the reads below only prove something once rows exist; the spec
 * that creates a competition and then looks for its answer key as another
 * user is added with `createCompetition` (docs/plan.md, PR 6).
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { authToken, put, recordsOf, roomExchange, subscribe, type RoomFrame } from './helpers/room'

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

function ackOf(frames: RoomFrame[], collection: string) {
  return frames.find(
    (frame) => frame.type === 'records.ack' && frame.payload?.requestId === `${collection}:${id}`,
  )?.payload
}

/** Try to create one record in every collection, then read every collection back. */
async function expectNoAccess(page: Page, token: string | null, role: string) {
  const writes = await roomExchange(
    page,
    token,
    COLLECTIONS.map((collection) => put(collection, id, RECORDS[collection] ?? {})),
  )
  expect(writes.find((frame) => frame.type === 'user.info')?.payload?.role).toBe(role)
  for (const collection of COLLECTIONS) {
    expect(ackOf(writes, collection), collection).toMatchObject({
      success: false,
      error: `CREATE DENIED: role=${role}, collection=${collection}`,
    })
  }

  const reads = await roomExchange(
    page,
    token,
    COLLECTIONS.map((c) => subscribe(c)),
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
  test.skip(
    loadAllTestAccounts().length < 1,
    'Needs a test account: `npx deepspace test accounts create --email <name>@deepspace.test --password-stdin`.',
  )
  const [member] = await users(1)
  await member.page.goto('/home')
  const token = await authToken(member.page)
  expect(token, 'the member has a token').not.toBeNull()
  await expectNoAccess(member.page, token, 'member')
})
