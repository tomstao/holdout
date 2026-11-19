/**
 * A submission's score on the private rows. Closed to every role; the close
 * job copies the chosen ones into final_standings. The record id is the
 * submission id.
 *
 * No column is `immutable`, on purpose: see CLOSED in ./permissions.ts.
 */
import type { CollectionSchema } from 'deepspace/schema'
import { CLOSED } from './permissions'

export const privateScoresSchema: CollectionSchema = {
  name: 'private_scores',
  columns: [
    {
      name: 'submissionId',
      storage: 'text',
      interpretation: 'plain',
      required: true,
    },
    {
      name: 'competitionId',
      storage: 'text',
      interpretation: 'plain',
      required: true,
    },
    {
      name: 'participantId',
      storage: 'text',
      interpretation: 'plain',
      required: true,
    },
    { name: 'privateScore', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['submissionId'],
  permissions: CLOSED,
}
