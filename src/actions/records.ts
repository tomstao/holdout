/**
 * Typed access to records from Worker code: the action `tools`, narrowed by
 * the record registry in src/contracts/records.ts. Writes are parsed against
 * the contract first, so the Worker never stores a row the browser could not
 * read back as its declared type.
 *
 * These calls bypass RBAC (they run as the app). Check the caller's rights
 * before using them (docs/architecture.md, "Trust model").
 */
import type { ActionTools } from 'deepspace/worker'
import type { z } from 'zod'
import {
  recordSchemas,
  type CollectionName,
  type RecordOf,
  type RecordQuery,
} from '../contracts/records'

/** A record's data as the SDK's tools type it (they require an object type). */
type Row<N extends CollectionName> = RecordOf<N> & Record<string, unknown>

const registry: Readonly<Partial<Record<string, z.ZodObject>>> = recordSchemas

function contractFor(name: string): z.ZodObject {
  const schema = registry[name]
  if (!schema)
    throw new Error(`No record contract for collection "${name}" in src/contracts/records.ts`)
  return schema
}

export function typedRecords(tools: ActionTools) {
  return {
    get: <N extends CollectionName>(name: N, recordId: string) => tools.get<Row<N>>(name, recordId),

    query: <N extends CollectionName>(name: N, query?: RecordQuery<RecordOf<N>>) =>
      tools.query<Row<N>>(name, query),

    create: <N extends CollectionName>(name: N, data: RecordOf<N>, recordId?: string) =>
      tools.create(name, contractFor(name).parse(data), recordId),

    update: <N extends CollectionName>(name: N, recordId: string, patch: Partial<RecordOf<N>>) =>
      tools.update(name, recordId, contractFor(name).partial().parse(patch)),

    remove: (name: CollectionName, recordId: string) => tools.remove(name, recordId),
  }
}
