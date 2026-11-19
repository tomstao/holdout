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
import { makeCreateCompetition } from './create-competition'
import { createCompetitionDeps, submitPredictionsDeps } from './host-files'
import { makeSubmitPredictions } from './submit-predictions'

const handlers = {
  createCompetition: makeCreateCompetition(createCompetitionDeps),
  submitPredictions: makeSubmitPredictions(submitPredictionsDeps),
} satisfies Record<ActionName, ActionHandler<Env>>

/** The shape the scaffold's action route expects. */
export const actions: Record<string, ActionHandler<Env>> = handlers
