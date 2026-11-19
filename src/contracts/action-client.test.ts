import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAction } from './define'
import type { Result } from './result'
import { createActionClient, type ActionClientDeps } from './action-client'

const contracts = {
  scoreCount: defineAction({
    description: 'Test-only contract.',
    input: z.object({ competitionId: z.string(), limit: z.number().int().default(5) }),
    output: z.object({ count: z.number() }),
  }),
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function client(respond: () => Promise<Response>, token: string | null = 'jwt') {
  const fetch = vi.fn<ActionClientDeps['fetch']>(respond)
  const callAction = createActionClient(contracts, {
    fetch,
    getToken: () => Promise.resolve(token),
  })
  return { fetch, callAction }
}

describe('createActionClient', () => {
  it('infers input and output types from the contract', () => {
    const { callAction } = client(() =>
      Promise.resolve(json({ success: true, data: { count: 1 } })),
    )

    expectTypeOf(callAction<'scoreCount'>)
      .parameter(1)
      .toEqualTypeOf<{ competitionId: string; limit?: number }>()
    expectTypeOf(callAction<'scoreCount'>).returns.resolves.toEqualTypeOf<
      Result<{ count: number }>
    >()
    // @ts-expect-error: not an action in the registry
    void callAction('deleteEverything', {})
  })

  it('posts the input with the bearer token to the action route', async () => {
    const { fetch, callAction } = client(() =>
      Promise.resolve(json({ success: true, data: { count: 3 } })),
    )

    const result = await callAction('scoreCount', { competitionId: 'c1' })

    expect(result).toEqual({ success: true, data: { count: 3 } })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('/api/actions/scoreCount')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt' })
    expect(JSON.parse(init.body as string)).toEqual({ competitionId: 'c1' })
  })

  it('does not call the server when signed out', async () => {
    const { fetch, callAction } = client(() => Promise.resolve(json({})), null)

    const result = await callAction('scoreCount', { competitionId: 'c1' })

    expect(result).toMatchObject({ success: false, code: 'unauthorized' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the failure code, message and issues the server sent', async () => {
    const { callAction } = client(() =>
      Promise.resolve(
        json({
          success: false,
          code: 'invalid_file',
          error: 'The file has 3 problems.',
          issues: [
            { path: ['row 2', 'species'], message: 'Unknown label "Penguin".' },
            { bogus: true },
          ],
        }),
      ),
    )

    const result = await callAction('scoreCount', { competitionId: 'c1' })

    expect(result).toEqual({
      success: false,
      code: 'invalid_file',
      error: 'The file has 3 problems.',
      issues: [{ path: ['row 2', 'species'], message: 'Unknown label "Penguin".' }],
    })
  })

  it.each([
    ['an unknown failure code', json({ success: false, code: 'teapot', error: 'No.' }), 'internal'],
    ['a 401', json({ error: 'Unauthorized' }, 401), 'unauthorized'],
    ['a body that is not JSON', new Response('<html>', { status: 502 }), 'internal'],
    [
      'a success that breaks the output contract',
      json({ success: true, data: { count: 'three' } }),
      'internal',
    ],
  ])('answers %s with a typed failure', async (_label, response, code) => {
    const { callAction } = client(() => Promise.resolve(response))

    const result = await callAction('scoreCount', { competitionId: 'c1' })

    expect(result).toMatchObject({ success: false, code })
  })

  it('reports a network failure as internal, but lets an abort propagate', async () => {
    const offline = client(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await offline.callAction('scoreCount', { competitionId: 'c1' })).toMatchObject({
      success: false,
      code: 'internal',
    })

    const controller = new AbortController()
    controller.abort()
    const aborted = client(() => Promise.reject(new DOMException('Aborted', 'AbortError')))
    await expect(
      aborted.callAction('scoreCount', { competitionId: 'c1' }, { signal: controller.signal }),
    ).rejects.toThrow('Aborted')
  })
})
