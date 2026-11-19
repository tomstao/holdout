/**
 * Test support: an in-memory stand-in for the record room's action tools, so a
 * handler can be unit-tested without a Worker. It keeps rows per collection,
 * records every call in order and can be told to fail one.
 *
 * It does not imitate permissions (action tools run with RBAC off) or
 * `uniqueOn`; tests that depend on those run against the real room in
 * tests/*.spec.ts.
 */
import type { ActionResult, ActionTools } from 'deepspace/worker'

type Row = Record<string, unknown>

export interface FakeRoom {
  tools: ActionTools
  /** The rows of a collection, by record id. */
  rows(collection: string): Map<string, Row>
  /** Every call so far, as `create:answer_keys:c1`. */
  calls: string[]
  /** Make the next call with this name fail, for example `create:competitions`. */
  failOn(call: string): void
}

const unsupported = (name: string) => () => Promise.reject(new Error(`fake tools: no ${name}`))

export function fakeRoom(seed: Record<string, Record<string, Row>> = {}): FakeRoom {
  const collections = new Map<string, Map<string, Row>>(
    Object.entries(seed).map(([name, rows]) => [name, new Map(Object.entries(rows))]),
  )
  const calls: string[] = []
  const failing = new Set<string>()
  let generated = 0

  const rows = (collection: string): Map<string, Row> => {
    let found = collections.get(collection)
    if (!found) {
      found = new Map()
      collections.set(collection, found)
    }
    return found
  }
  const refused = (call: string): ActionResult<never> | undefined =>
    failing.delete(call) ? { success: false, error: `fake failure of ${call}` } : undefined
  const envelope = (recordId: string, data: Row) => ({
    recordId,
    data,
    createdBy: 'fake',
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z',
  })

  const tools: ActionTools = {
    create(collection, data, recordId) {
      const id = recordId ?? `generated_${++generated}`
      calls.push(`create:${collection}:${id}`)
      const failure = refused(`create:${collection}`)
      if (failure) return Promise.resolve(failure)
      rows(collection).set(id, { ...rows(collection).get(id), ...data })
      return Promise.resolve({ success: true, data: { recordId: id } })
    },
    update(collection, recordId, data) {
      calls.push(`update:${collection}:${recordId}`)
      const failure = refused(`update:${collection}`)
      if (failure) return Promise.resolve(failure)
      const existing = rows(collection).get(recordId)
      if (!existing) return Promise.resolve({ success: false, error: 'Record not found' })
      rows(collection).set(recordId, { ...existing, ...data })
      return Promise.resolve({ success: true, data: { recordId } })
    },
    remove(collection, recordId) {
      calls.push(`remove:${collection}:${recordId}`)
      rows(collection).delete(recordId)
      return Promise.resolve({ success: true, data: { recordId } })
    },
    // The room returns whatever is stored; the caller's type parameter is a claim, not a check.
    get: ((collection: string, recordId: string) => {
      calls.push(`get:${collection}:${recordId}`)
      const data = rows(collection).get(recordId)
      return Promise.resolve(
        data
          ? { success: true, data: { record: envelope(recordId, data) } }
          : { success: false, error: 'Record not found' },
      )
    }) as ActionTools['get'],
    query: ((collection: string, options?: { where?: Row; limit?: number }) => {
      calls.push(`query:${collection}`)
      const where = Object.entries(options?.where ?? {})
      const records = [...rows(collection)]
        .filter(([, data]) => where.every(([field, value]) => data[field] === value))
        .slice(0, options?.limit)
        .map(([recordId, data]) => envelope(recordId, data))
      return Promise.resolve({ success: true, data: { records, count: records.length } })
    }) as ActionTools['query'],
    deleteWhere: unsupported('deleteWhere'),
    integration: unsupported('integration'),
    registerUser: unsupported('registerUser'),
  }

  return { tools, rows, calls, failOn: (call) => failing.add(call) }
}
