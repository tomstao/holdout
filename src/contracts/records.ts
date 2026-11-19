/**
 * Registry of record shapes: collection name -> Zod schema of the record's
 * `data` (the fields under `record.data`; recordId, createdBy, createdAt and
 * updatedAt are the SDK's envelope and are not listed).
 *
 * Two descriptions of each collection exist on purpose:
 *   - src/schemas/<name>-schema.ts is the DeepSpace CollectionSchema: storage
 *     columns and RBAC, evaluated inside the Durable Object.
 *   - the Zod schema here is the TypeScript contract both runtimes compile against.
 * src/contracts/schema-drift.test.ts fails when the two disagree.
 *
 * The collections are described in docs/architecture.md ("Data model").
 */
import type { z } from 'zod'
import {
  answerKeyRecord,
  competitionRecord,
  finalStandingRecord,
  privateScoreRecord,
  submissionRecord,
} from './competitions'

export const recordSchemas = {
  competitions: competitionRecord,
  answer_keys: answerKeyRecord,
  submissions: submissionRecord,
  private_scores: privateScoreRecord,
  final_standings: finalStandingRecord,
} as const satisfies Readonly<Record<string, z.ZodObject>>

export type RecordSchemas = typeof recordSchemas
export type CollectionName = keyof RecordSchemas
export type RecordOf<N extends CollectionName> = z.output<RecordSchemas[N]>

/** Fields every record carries in its envelope, usable for ordering. */
export type EnvelopeField = 'createdAt' | 'updatedAt' | 'createdBy'

/**
 * A query over one collection. `where` is exact-match only: the SDK has no
 * range filters, so compare dates and scores in code.
 */
export interface RecordQuery<T> {
  where?: { [K in keyof T]?: T[K] }
  orderBy?: (keyof T & string) | EnvelopeField
  orderDir?: 'asc' | 'desc'
  limit?: number
}
