/**
 * Registry of every server action's contract.
 *
 * Adding an action:
 *   1. Define its contract here with `defineAction` (input and output Zod schemas).
 *   2. Implement it in src/actions/ with `implement(contract, handler)` and add
 *      it to `actions` in src/actions/index.ts. The compiler refuses a
 *      contract without a handler, and a handler without a contract.
 *   3. Call it from the browser with `callAction('<name>', input)` from
 *      src/client/actions.ts; input and output types are inferred from here.
 *
 * The contracts are defined in ./competitions.ts and described in
 * docs/architecture.md ("Server actions").
 */
import { createCompetition } from './competitions'
import type { ContractRegistry } from './define'

export const actionContracts = { createCompetition } as const satisfies ContractRegistry

export type ActionContracts = typeof actionContracts
export type ActionName = keyof ActionContracts
