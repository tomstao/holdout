/**
 * A participant's final result, written once by the close job. Public to
 * read. The record id is `<competitionId>:<participantId>`.
 */
import type { CollectionSchema } from 'deepspace/schema'
import { READ_ONLY } from './permissions'

export const finalStandingsSchema: CollectionSchema = {
  name: 'final_standings',
  columns: [
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
    { name: 'participantName', storage: 'text', interpretation: 'plain' },
    { name: 'rank', storage: 'number', interpretation: 'plain' },
    { name: 'finalScore', storage: 'number', interpretation: 'plain' },
    { name: 'publicRank', storage: 'number', interpretation: 'plain' },
    { name: 'publicScore', storage: 'number', interpretation: 'plain' },
    { name: 'submissionCount', storage: 'number', interpretation: 'plain' },
    // { submissionId, publicScore, privateScore }[]: the submissions that counted.
    { name: 'chosen', storage: 'text', interpretation: { kind: 'json' } },
  ],
  uniqueOn: ['competitionId', 'participantId'],
  permissions: READ_ONLY,
}
