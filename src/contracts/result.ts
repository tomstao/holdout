/**
 * The result envelope every server action returns, shared by the Worker and
 * the browser. It is the SDK's `ActionResult` with a closed set of failure
 * codes, so callers can branch on `code` with an exhaustive switch.
 */

export const FAILURE_CODES = [
  /** The request body did not match the action's input contract. */
  'invalid_input',
  /** No verified caller. The action route answers 401 before an action runs. */
  'unauthorized',
  /** The caller is signed in but not allowed (e.g. not the competition's host). */
  'forbidden',
  'not_found',
  /** The competition is not accepting this (e.g. closed). */
  'closed',
  /** A per-participant limit was reached (e.g. daily submissions). */
  'limit_reached',
  /** An uploaded CSV failed validation; `issues` lists what to fix. */
  'invalid_file',
  /** A concurrent write won; retrying may succeed. */
  'conflict',
  /** The action broke its own output contract or an upstream call failed. */
  'internal',
] as const

export type FailureCode = (typeof FAILURE_CODES)[number]

/**
 * One problem with the input. Same shape as the SDK's `ApiErrorIssue`, so a
 * `Failure` is a valid `ActionResult` for the scaffold's action route.
 */
export interface Issue {
  /** Where the problem is: a field path such as `['deadline']`, or a CSV cell such as `['row 12', 'species']`. */
  path?: string[]
  message: string
}

export interface Failure {
  success: false
  code: FailureCode
  /** A sentence safe to show the user as is. */
  error: string
  issues?: Issue[]
}

export interface Success<T> {
  success: true
  data: T
}

export type Result<T> = Success<T> | Failure

export function ok<T>(data: T): Success<T> {
  return { success: true, data }
}

export function fail(code: FailureCode, error: string, issues?: Issue[]): Failure {
  return issues === undefined
    ? { success: false, code, error }
    : { success: false, code, error, issues }
}

export function isFailureCode(value: unknown): value is FailureCode {
  return typeof value === 'string' && (FAILURE_CODES as readonly string[]).includes(value)
}
