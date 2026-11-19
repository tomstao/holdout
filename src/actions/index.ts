/**
 * Every server action, served by src/server/action-routes.ts at
 * POST /api/actions/<name>.
 *
 * Each entry is `implement(actionContracts.<name>, handler)`. The `satisfies`
 * clause makes the compiler refuse a contract without a handler and a handler
 * without a contract (see src/contracts/actions.ts).
 */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { ActionName } from '../contracts/actions'

// Empty until the first contract lands (docs/plan.md, day 1); delete this disable then.
// eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type
const handlers = {} satisfies Record<ActionName, ActionHandler<Env>>

/** The shape the scaffold's action route expects. */
export const actions: Record<string, ActionHandler<Env>> = handlers
