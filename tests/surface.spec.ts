/**
 * The Worker serves only what the app uses (docs/decisions/0016). Each of
 * these was a default of the scaffold, and each was a way around the app's
 * rules. Checked here against the running Worker and the real record room.
 *
 * The probes are chosen to be harmless if a check ever regresses: a GET where
 * the real call is a POST, an integration that does not exist, a file of a
 * few bytes.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { ackOf, authToken, put, recordsOf, ROOM, roomExchange, subscribe } from './helpers/room'

test('only the app’s record room has a socket route', async ({ page }) => {
  await page.goto('/home')
  for (const path of [
    `/ws/cron/${ROOM}`,
    '/ws/cron/a-room-nobody-made',
    `/ws/jobs/${ROOM}`,
    '/ws/yjs/any-document',
    '/ws/canvas/any-document',
    '/ws/presence/any-scope',
    '/ws/a-room-nobody-made',
  ]) {
    const response = await page.request.get(path)
    expect(response.status(), path).toBe(404)
  }
  // The real room wants a WebSocket, not a page load.
  expect((await page.request.get(`/ws/${ROOM}`)).status()).toBe(426)
})

test('a visitor cannot write to the room’s built-in collection', async ({ page }) => {
  await page.goto('/home')
  const id = `probe-${Date.now()}`
  const frames = await roomExchange(page, null, [
    put('canvas-settings', id, { note: 'a row a client should not be able to write' }),
    subscribe('canvas-settings'),
  ])
  expect(ackOf(frames, 'canvas-settings', id)).toBeUndefined()
  expect(recordsOf(frames, 'canvas-settings')).toBeUndefined()
  expect(frames.filter((frame) => frame.payload?.error === 'Unknown collection')).toHaveLength(2)
  // The room still answers for the app's own collections on the same socket rules.
  const normal = await roomExchange(page, null, [subscribe('competitions')])
  expect(recordsOf(normal, 'competitions')).toBeDefined()
})

test.describe('as a signed-in member', () => {
  test.skip(
    loadAllTestAccounts().length < 1,
    'Needs 1 test account. Create one with ' +
      '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" --password-stdin`.',
  )

  test('no integration, no agent tool and no upload is served', async ({ users }) => {
    const [member] = await users(1)
    await member.page.goto('/home')
    const token = await authToken(member.page)
    const headers = { Authorization: `Bearer ${token ?? ''}` }

    // The scaffold billed an unlisted integration to the app's owner.
    for (const path of ['/api/integrations/email/send', '/api/integrations/no-such/thing']) {
      const response = await member.page.request.get(path, { headers })
      expect(response.status(), path).toBe(404)
      expect(await response.json()).toEqual({ error: 'Unknown integration' })
    }

    // The scaffold ran record queries for a signed-in user over HTTP.
    const tools = await member.page.request.post('/_deepspace/agent/browser/tools/records_query', {
      headers,
      data: { input: { collection: 'private_scores', limit: 1 } },
    })
    expect(tools.status()).toBe(404)

    // The scaffold's file proxy took uploads from any member.
    const upload = await member.page.request.post('/api/files/upload?scope=self', {
      headers,
      multipart: { file: { name: 'probe.csv', mimeType: 'text/csv', buffer: Buffer.from('a\n') } },
    })
    expect(upload.status()).toBe(405)

    // A member's socket is refused the built-in collection like a visitor's.
    const id = `probe-${Date.now()}`
    const frames = await roomExchange(member.page, token, [put('canvas-settings', id, { a: 1 })])
    expect(ackOf(frames, 'canvas-settings', id)).toBeUndefined()
    expect(frames.some((frame) => frame.payload?.error === 'Unknown collection')).toBe(true)
  })
})
