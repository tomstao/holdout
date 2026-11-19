/**
 * The Worker serves only what the app uses (docs/decisions/0016). These run
 * the real route registrations against a Worker environment that fails if a
 * request is forwarded anywhere it should not be.
 */
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppContext, Env } from '../../worker'
import { registerAuthAndIntegrationRoutes, registerPlatformProxyRoutes } from './http-routes'
import { registerRealtimeRoutes } from './realtime-routes'

const APP_ID = 'app_test'
const ROOM = `app:${APP_ID}`

/** An environment whose record room notes each request it is handed. */
function environment() {
  const reached: { room: string; request: Request }[] = []
  const forbidden = (name: string) => ({
    fetch: () => {
      throw new Error(`${name} must not be reached`)
    },
  })
  const env = {
    DEEPSPACE_APP_ID: APP_ID,
    AUTH_JWT_PUBLIC_KEY: 'not-a-key',
    AUTH_JWT_ISSUER: 'https://auth.invalid',
    APP_OWNER_JWT: 'owner-jwt',
    OWNER_USER_ID: 'user_owner',
    RECORD_ROOMS: {
      idFromName: (name: string) => name,
      get: (room: string) => ({
        fetch: (request: Request) => {
          reached.push({ room, request })
          return new Response('the room', { status: 200 })
        },
      }),
    },
    API_WORKER: forbidden('The platform API'),
    PLATFORM_WORKER: forbidden('The platform file store'),
  } as unknown as Env
  return { env, reached }
}

function worker() {
  const app = new Hono<AppContext>()
  registerAuthAndIntegrationRoutes(app)
  registerRealtimeRoutes(app)
  registerPlatformProxyRoutes(app)
  return app
}

const upgrade = { headers: { Upgrade: 'websocket' } }

describe('socket routes', () => {
  it('hands a WebSocket upgrade for the app’s room to the record room', async () => {
    const { env, reached } = environment()
    const response = await worker().request(`/ws/${ROOM}`, upgrade, env)
    expect(response.status).toBe(200)
    expect(reached.map((call) => call.room)).toEqual([ROOM])
  })

  it('does not trust identity the caller puts in the request', async () => {
    const { env, reached } = environment()
    await worker().request(
      `/ws/${ROOM}?userId=user_owner&role=admin`,
      { headers: { Upgrade: 'websocket', 'X-User-Id': 'user_owner', 'X-User-Role': 'admin' } },
      env,
    )
    const forwarded = reached[0]?.request
    expect(forwarded?.headers.get('X-User-Id')).not.toBe('user_owner')
    expect(forwarded?.headers.get('X-User-Role')).not.toBe('admin')
    expect(new URL(forwarded?.url ?? 'https://x').searchParams.get('role')).not.toBe('admin')
  })

  it('refuses a token it cannot verify, instead of treating the caller as signed out', async () => {
    const { env, reached } = environment()
    const response = await worker().request(`/ws/${ROOM}?token=forged`, upgrade, env)
    expect(response.status).toBe(401)
    expect(reached).toEqual([])
  })

  it('wants a WebSocket, not a page load', async () => {
    const { env, reached } = environment()
    expect((await worker().request(`/ws/${ROOM}`, {}, env)).status).toBe(426)
    expect(reached).toEqual([])
  })

  it('knows no other room and no other kind of room', async () => {
    const { env, reached } = environment()
    for (const path of [
      '/ws/app:another_app',
      '/ws/x1',
      `/ws/cron/${ROOM}`,
      '/ws/cron/x1',
      `/ws/jobs/${ROOM}`,
      '/ws/yjs/doc',
      '/ws/canvas/doc',
      '/ws/presence/scope',
    ]) {
      const response = await worker().request(path, upgrade, env)
      expect(response.status, path).toBe(404)
    }
    expect(reached).toEqual([])
  })
})

describe('the integrations proxy', () => {
  it('serves no integration, signed in or not, with any method', async () => {
    const { env } = environment()
    for (const [path, method] of [
      ['/api/integrations/email/send', 'POST'],
      ['/api/integrations/openai/chat-completion', 'POST'],
      ['/api/integrations/google/anything', 'GET'],
      ['/api/integrations/constructor/x', 'POST'],
    ] as const) {
      const response = await worker().request(
        path,
        { method, headers: { Authorization: 'Bearer any-user-token' } },
        env,
      )
      // The environment throws if the platform API is reached with the owner's token.
      expect(response.status, path).toBe(404)
      expect(await response.json()).toEqual({ error: 'Unknown integration' })
    }
  })
})

describe('the files proxy', () => {
  it('takes no uploads', async () => {
    const { env } = environment()
    for (const method of ['POST', 'PUT', 'PATCH']) {
      const response = await worker().request(
        '/api/files/upload?scope=self',
        { method, headers: { Authorization: 'Bearer any-user-token' }, body: 'a,b\n1,2\n' },
        env,
      )
      expect(response.status, method).toBe(405)
    }
  })
})
