import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

/**
 * Talks to the app's record room over its WebSocket, the way the SDK's hooks
 * do, but without a page that mounts them. A spec can then ask the room for
 * any collection as any caller and see exactly what the room sends back,
 * which is the read boundary of the app (docs/architecture.md, "System").
 */

const wrangler = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
const appId = /DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/.exec(wrangler)?.[1]
if (!appId) throw new Error('wrangler.toml has no DEEPSPACE_APP_ID')

/** The app's one record room. */
export const ROOM = `app:${appId}`

export interface RoomFrame {
  type: string
  payload?: Record<string, unknown>
}

/** The signed-in user's token, as the SDK fetches it; null when signed out. */
export async function authToken(page: Page): Promise<string | null> {
  const response = await page.request.post('/api/auth/token', {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok()) return null
  const body = (await response.json()) as { token?: string }
  return body.token ?? null
}

/**
 * Open the room's socket as the page's user (or signed out when `token` is
 * null), send `messages`, and return every frame the room sent until it has
 * been quiet for `quietMs`. The page must already be on the app's origin.
 */
export async function roomExchange(
  page: Page,
  token: string | null,
  messages: RoomFrame[],
  quietMs = 1000,
): Promise<RoomFrame[]> {
  return page.evaluate(
    ({ origin, room, token, messages, quietMs }) =>
      new Promise<RoomFrame[]>((resolve, reject) => {
        const url = new URL(`/ws/${room}`, origin)
        url.protocol = url.protocol.replace('http', 'ws')
        if (token) url.searchParams.set('token', token)
        const socket = new WebSocket(url)
        const frames: RoomFrame[] = []
        let quiet: ReturnType<typeof setTimeout> | undefined
        const finish = () => {
          socket.close()
          resolve(frames)
        }
        const rearm = () => {
          clearTimeout(quiet)
          quiet = setTimeout(finish, quietMs)
        }
        socket.onopen = () => {
          for (const message of messages) socket.send(JSON.stringify(message))
          rearm()
        }
        socket.onmessage = (event) => {
          if (typeof event.data === 'string') frames.push(JSON.parse(event.data) as RoomFrame)
          rearm()
        }
        socket.onerror = () => {
          reject(new Error(`the socket to ${url.pathname} failed`))
        }
      }),
    { origin: new URL(page.url()).origin, room: ROOM, token, messages, quietMs },
  )
}

export const subscribe = (
  collection: string,
  subscriptionId = collection,
  where?: Record<string, unknown>,
): RoomFrame => ({
  type: 'core.subscribe',
  payload: { subscriptionId, query: { collection, ...(where ? { where } : {}) } },
})

export const remove = (collection: string, recordId: string): RoomFrame => ({
  type: 'core.delete',
  payload: { collection, recordId, requestId: requestId(collection, recordId) },
})

/** The room's answer to a `put` or a `remove` of this record. */
export function ackOf(frames: RoomFrame[], collection: string, recordId: string) {
  return frames.find(
    (frame) =>
      frame.type === 'records.ack' &&
      String(frame.payload?.requestId).startsWith(`${collection}:${recordId}:`),
  )?.payload
}

let requests = 0

/**
 * A request id no earlier write used. The room remembers the answer to a
 * request id and replays it for a later write with the same id, whatever that
 * write contains, so reusing one makes every probe look like the first.
 */
function requestId(collection: string, recordId: string): string {
  return `${collection}:${recordId}:${Date.now()}-${++requests}`
}

export const put = (collection: string, recordId: string, data: object): RoomFrame => ({
  type: 'core.put',
  payload: { collection, recordId, data, requestId: requestId(collection, recordId) },
})

/** The records the room returned for a subscription, or undefined if it never answered. */
export function recordsOf(frames: RoomFrame[], subscriptionId: string): unknown[] | undefined {
  const result = frames.find(
    (frame) =>
      frame.type === 'core.query_result' && frame.payload?.subscriptionId === subscriptionId,
  )
  return result?.payload?.records as unknown[] | undefined
}
