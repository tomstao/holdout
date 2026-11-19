/**
 * The Worker wrapper and the browser client agree on the wire format:
 * a handler's result, serialised as the action route does, parses back into
 * the same typed result in the client.
 */
import type { ActionContext, ActionTools } from 'deepspace/worker'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Env } from '../../worker'
import { createActionClient } from '../contracts/action-client'
import { defineAction } from '../contracts/define'
import { fail, ok } from '../contracts/result'
import { implement } from './implement'

const contracts = {
  submit: defineAction({
    description: 'Test-only contract.',
    input: z.object({ csv: z.string().min(1) }),
    output: z.object({ publicScore: z.number() }),
  }),
}

const handler = implement(contracts.submit, ({ input }) =>
  Promise.resolve(
    input.csv.includes('id')
      ? ok({ publicScore: 0.875 })
      : fail('invalid_file', 'The file has no header row.', [
          { path: ['row 1'], message: 'Expected "id".' },
        ]),
  ),
)

/** Plays the scaffold's action route: run the handler, answer its result as JSON. */
const callAction = createActionClient(contracts, {
  getToken: () => Promise.resolve('jwt'),
  fetch: async (_url, init) => {
    const context: ActionContext<Env> = {
      userId: 'user_1',
      params: JSON.parse(init.body as string) as Record<string, unknown>,
      tools: {} as ActionTools,
      env: {} as Env,
      callerJwt: 'jwt',
    }
    return Response.json(await handler(context))
  },
})

describe('action wire format', () => {
  it('carries a success through', async () => {
    expect(await callAction('submit', { csv: 'id,species\n1,Adelie' })).toEqual({
      success: true,
      data: { publicScore: 0.875 },
    })
  })

  it('carries a failure with its issues through', async () => {
    expect(await callAction('submit', { csv: '1,Adelie' })).toEqual({
      success: false,
      code: 'invalid_file',
      error: 'The file has no header row.',
      issues: [{ path: ['row 1'], message: 'Expected "id".' }],
    })
  })

  it('carries an input validation failure through', async () => {
    expect(await callAction('submit', { csv: '' })).toMatchObject({
      success: false,
      code: 'invalid_input',
      issues: [{ path: ['csv'] }],
    })
  })
})
