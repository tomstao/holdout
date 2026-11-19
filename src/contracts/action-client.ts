/**
 * A typed client for server actions. `createActionClient(contracts, deps)`
 * returns `callAction(name, input)`, whose input and output types are
 * inferred from the contract registry. The response is checked against the
 * contract too, so a stale browser bundle talking to a newer Worker fails
 * loudly instead of rendering the wrong shape.
 *
 * It lives in contracts because it is wire protocol, not browser code: the
 * dependencies are injected, so it has no SDK import, runs in Node tests and
 * is checked against the Worker wrapper (src/actions/roundtrip.test.ts).
 * src/client/actions.ts binds the browser's fetch and token.
 */
import type { ActionInput, ActionOutput, ContractRegistry } from './define'
import { fail, isFailureCode, ok, type Issue, type Result } from './result'

export interface ActionClientDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  /** The signed-in caller's JWT, or null when signed out. */
  getToken: () => Promise<string | null>
}

export type CallAction<R extends ContractRegistry> = <N extends keyof R & string>(
  name: N,
  input: ActionInput<R[N]>,
  options?: { signal?: AbortSignal },
) => Promise<Result<ActionOutput<R[N]>>>

const UNEXPECTED = 'The server sent an unexpected response. Reload the page and try again.'

export function createActionClient<R extends ContractRegistry>(
  contracts: R,
  deps: ActionClientDeps,
): CallAction<R> {
  return async (name, input, options) => {
    const token = await deps.getToken()
    if (!token) return fail('unauthorized', 'Sign in to do this.')

    let response: Response
    try {
      response = await deps.fetch(`/api/actions/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
        signal: options?.signal ?? null,
      })
    } catch (error) {
      if (options?.signal?.aborted) throw error
      return fail('internal', 'Could not reach the server. Check your connection and try again.')
    }

    if (response.status === 401)
      return fail('unauthorized', 'Your session has expired. Sign in again.')

    const body: unknown = await response.json().catch(() => null)
    if (!isRecord(body) || typeof body.success !== 'boolean') return fail('internal', UNEXPECTED)

    if (body.success) {
      const output = contracts[name]?.output.safeParse(body.data)
      return output?.success
        ? ok(output.data as ActionOutput<R[typeof name]>)
        : fail('internal', UNEXPECTED)
    }

    return fail(
      isFailureCode(body.code) ? body.code : 'internal',
      typeof body.error === 'string' ? body.error : 'Something went wrong. Try again.',
      parseIssues(body.issues),
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseIssues(value: unknown): Issue[] | undefined {
  if (!Array.isArray(value)) return undefined
  const issues = value.filter(isRecord).flatMap((issue): Issue[] => {
    if (typeof issue.message !== 'string') return []
    const path = Array.isArray(issue.path) ? issue.path.map(String) : undefined
    return [path ? { path, message: issue.message } : { message: issue.message }]
  })
  return issues.length > 0 ? issues : undefined
}
