/**
 * Small helpers several actions share.
 */
import type { ActionResult, ActionTools } from 'deepspace/worker'

/**
 * The caller's display name, from their own `users` row. Only the name leaves
 * the row: actions read users with RBAC off and the row holds the email.
 */
export async function displayName(
  tools: ActionTools,
  userId: string,
  fallback: string,
): Promise<string> {
  const user = await tools.get<{ name?: string }>('users', userId)
  const name = user.success ? (user.data.record.data.name ?? '').trim() : ''
  return name === '' ? fallback : name
}

/**
 * Whether a refused write was refused by the collection's `uniqueOn`. The room
 * gives that refusal no code, only an error that begins `Duplicate:`
 * (docs/lessons.md, day-1 spikes), so it is detected here and nowhere else.
 */
export function isUniqueConflict(result: ActionResult): boolean {
  return !result.success && result.error.startsWith('Duplicate:')
}
