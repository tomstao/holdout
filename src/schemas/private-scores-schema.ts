/**
 * A submission's score on the private rows. Closed to every role; the close
 * job copies the chosen ones into final_standings. The record id is the
 * submission id.
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
      immutable: true,
    },
    {
      name: 'competitionId',
      storage: 'text',
      interpretation: 'plain',
      required: true,
      immutable: true,
    },
    {
      name: 'participantId',
      storage: 'text',
      interpretation: 'plain',
      required: true,
      immutable: true,
    },
    { name: 'privateScore', storage: 'number', interpretation: 'plain', immutable: true },
  ],
  uniqueOn: ['submissionId'],
  permissions: CLOSED,
}
