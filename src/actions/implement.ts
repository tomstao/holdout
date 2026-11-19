/**
 * Turns an action contract plus a typed handler into the SDK's untyped
 * `ActionHandler`, which the scaffold's route (src/server/action-routes.ts)
 * serves at POST /api/actions/<name>.
 *
 * - Input is validated against the contract before the handler runs.
 * - Output is parsed against the contract after it runs. Zod objects drop
 *   undeclared keys, so a handler cannot leak a field the contract does not
 *   name (a private score, a raw `users` row). A handler that returns the
 *   wrong shape is logged and answered with `internal`.
 *
 * Security still belongs to the handler: actions run with RBAC off, so check
 * that the caller may touch the records named in the input
 * (docs/architecture.md, "Trust model").
 */
import type { ActionContext, ActionHandler } from 'deepspace/worker'
import { z } from 'zod'
import type { Env } from '../../worker'
import type { ActionContract, ActionOutput, ParsedActionInput } from '../contracts/define'
import { fail, ok, type Issue, type Result } from '../contracts/result'

export interface TypedActionContext<C extends ActionContract> extends Omit<
  ActionContext<Env>,
  'params'
> {
  input: ParsedActionInput<C>
}

export type TypedActionHandler<C extends ActionContract> = (
  context: TypedActionContext<C>,
) => Promise<Result<ActionOutput<C>>>

export function toIssues(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }))
}

export function implement<C extends ActionContract>(
  contract: C,
  handler: TypedActionHandler<C>,
): ActionHandler<Env> {
  return async ({ params, ...context }) => {
    const input = contract.input.safeParse(params)
    if (!input.success) {
      return fail(
        'invalid_input',
        'The request does not match what this action expects.',
        toIssues(input.error),
      )
    }

    const result = await handler({ ...context, input: input.data as ParsedActionInput<C> })
    if (!result.success) return result

    const output = contract.output.safeParse(result.data)
    if (!output.success) {
      console.error(`[action] output broke its contract: ${z.prettifyError(output.error)}`)
      return fail('internal', 'Something went wrong on our side. Try again.')
    }
    return ok(output.data)
  }
}
