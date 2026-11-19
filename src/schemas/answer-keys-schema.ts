/**
 * The answer key of a competition: the one secret in the app. Closed to every
 * role (docs/decisions/0006-answer-key-in-a-server-only-collection.md). The
 * record id is the competition id.
 *
 * No column is `immutable`, on purpose: see CLOSED in ./permissions.ts.
 */
import type { CollectionSchema } from 'deepspace/schema'
import { CLOSED } from './permissions'

export const answerKeysSchema: CollectionSchema = {
  name: 'answer_keys',
  columns: [
    {
      name: 'competitionId',
      storage: 'text',
      interpretation: 'plain',
      required: true,
    },
    // [id, target, split][]; at most 1.5 MB of JSON (src/domain/dataset.ts).
    { name: 'rows', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'rowCount', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['competitionId'],
  permissions: CLOSED,
}
