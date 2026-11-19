/**
 * The record room's tools for Worker code that is not an action: the cron
 * task, jobs and routes. Same wire call as the action tools
 * (src/server/action-routes.ts), acting as the app owner.
 *
 * RBAC is off, as it is for actions: this code reads and writes the closed
 * collections. Nothing here is reachable by a client; whatever calls it
 * decides what leaves the Worker.
 */
import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker.js'

const unsupported = (name: string) => () =>
  Promise.reject(new Error(`roomTools has no ${name}; use an action or buildCronContext`))

export function roomTools(env: Env): ActionTools {
  const room = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))

  async function run<TData>(
    tool: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult<TData>> {
    const response = await room.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({ tool, params }),
      }),
    )
    return response.json<ActionResult<TData>>()
  }

  return {
    create: (collection, data, recordId) => run('records.create', { collection, data, recordId }),
    update: (collection, recordId, data) => run('records.update', { collection, recordId, data }),
    remove: (collection, recordId) => run('records.delete', { collection, recordId }),
    deleteWhere: (collection, where, limit) =>
      run('records.deleteWhere', { collection, where, limit }),
    get: (collection, recordId) => run('records.get', { collection, recordId }),
    query: (collection, options) => run('records.query', { collection, ...options }),
    integration: unsupported('integration'),
    registerUser: unsupported('registerUser'),
  }
}
