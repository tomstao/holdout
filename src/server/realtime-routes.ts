/**
 * The one WebSocket route: the app's record room.
 *
 * The scaffold also routed sockets to Yjs, canvas, presence, cron and job
 * rooms, each under any room name a caller chose. This app uses none of them
 * from the browser, and two were holes (docs/decisions/0016):
 *
 *   - a signed-in member's cron socket may pause a task, so anyone could stop
 *     competitions from closing;
 *   - a request for a room name nobody had used created that room. For a
 *     cron room that is a new copy of the close task, run every minute for
 *     good.
 *
 * So only `app:<this app's id>` is a room here, and only for a WebSocket
 * upgrade. The cron and job rooms are reached from Worker code alone
 * (worker.ts arms the cron room; src/cron.ts enqueues jobs).
 *
 * Caller identity in query parameters and headers is never trusted: the
 * token is verified here and the room is sent the verified identity in
 * internal-only headers.
 */
import type { Hono } from 'hono'
import { authenticatedRoomRequest, verifyJwt } from 'deepspace/worker'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext } from '../../worker.js'

export function registerRealtimeRoutes(app: Hono<AppContext>): void {
  app.get('/ws/:roomId', async (c) => {
    const room = `app:${c.env.DEEPSPACE_APP_ID}`
    if (c.req.param('roomId') !== room) return c.json({ error: 'not_found' }, 404)
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
      return c.json({ error: 'Expected a WebSocket upgrade' }, 426)
    }

    // Signed out is allowed: the room's own rules decide what a visitor reads.
    const token = new URL(c.req.url).searchParams.get('token')
    let auth: VerifyResult | null = null
    if (token) {
      const verified = await verifyJwt(
        { publicKey: c.env.AUTH_JWT_PUBLIC_KEY, issuer: c.env.AUTH_JWT_ISSUER },
        token,
      )
      auth = verified.result
      if (!auth) return new Response('Unauthorized', { status: 401 })
    }

    const stub = c.env.RECORD_ROOMS.get(c.env.RECORD_ROOMS.idFromName(room))
    return stub.fetch(authenticatedRoomRequest(c.req.raw, auth, undefined))
  })

  // Nothing else lives under /ws: say so, instead of serving the page shell.
  app.all('/ws/*', (c) => c.json({ error: 'not_found' }, 404))
}
