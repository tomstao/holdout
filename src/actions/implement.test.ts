import type { ActionContext, ActionTools } from 'deepspace/worker'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import type { Env } from '../../worker'
import { defineAction } from '../contracts/define'
import { fail, ok } from '../contracts/result'
import { implement } from './implement'

const renameContract = defineAction({
  description: 'Test-only contract.',
  input: z.object({ id: z.string().min(1), title: z.string().trim().min(3) }),
  output: z.object({ id: z.string(), title: z.string() }),
})

function context(params: unknown): ActionContext<Env> {
  return {
    userId: 'user_1',
    params: params as Record<string, unknown>,
    tools: {} as ActionTools,
    env: {} as Env,
    callerJwt: 'jwt',
  }
}

describe('implement', () => {
  it('refuses input that breaks the contract, naming each field', async () => {
    const handler = vi.fn()
    const action = implement(renameContract, handler)

    const result = await action(context({ id: '', title: 'x' }))

    expect(handler).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: false, code: 'invalid_input' })
    if (result.success) return
    expect(result.issues?.map((issue) => issue.path)).toEqual([['id'], ['title']])
  })

  it('hands the handler parsed input and the caller', async () => {
    const action = implement(renameContract, ({ input, userId }) => {
      expectTypeOf(input).toEqualTypeOf<{ id: string; title: string }>()
      return Promise.resolve(ok({ id: input.id, title: `${input.title} by ${userId}` }))
    })

    const result = await action(context({ id: 'c1', title: '  Penguins  ' }))

    expect(result).toEqual({ success: true, data: { id: 'c1', title: 'Penguins by user_1' } })
  })

  it('drops output fields the contract does not declare', async () => {
    const action = implement(renameContract, () =>
      Promise.resolve(
        ok({ id: 'c1', title: 'Penguins', privateScore: 0.91 } as { id: string; title: string }),
      ),
    )

    const result = await action(context({ id: 'c1', title: 'Penguins' }))

    expect(result).toEqual({ success: true, data: { id: 'c1', title: 'Penguins' } })
  })

  it('answers internal when the handler breaks its own output contract', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const action = implement(renameContract, () =>
      Promise.resolve(ok({ id: 'c1' } as { id: string; title: string })),
    )

    const result = await action(context({ id: 'c1', title: 'Penguins' }))

    expect(result).toMatchObject({ success: false, code: 'internal' })
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('passes a handler failure through unchanged', async () => {
    const action = implement(renameContract, () =>
      Promise.resolve(fail('forbidden', 'Only the host can rename this competition.')),
    )

    const result = await action(context({ id: 'c1', title: 'Penguins' }))

    expect(result).toEqual({
      success: false,
      code: 'forbidden',
      error: 'Only the host can rename this competition.',
    })
  })
})
