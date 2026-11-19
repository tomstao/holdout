/**
 * One scored submission with its public score. Public to read: the live
 * leaderboard is derived from these rows in the browser
 * (docs/decisions/0007-derive-the-leaderboard-from-submissions.md).
 *
 * `uniqueOn` is the daily limit: a participant can hold each numbered slot of
 * a UTC day once (docs/decisions/0008-daily-limit-with-uniqueon-slots.md).
 */
import type { CollectionSchema } from 'deepspace/schema'
import { READ_ONLY } from './permissions'

export const submissionsSchema: CollectionSchema = {
  name: 'submissions',
  columns: [
    {
      name: 'competitionId',
      storage: 'text',
      interpretation: 'plain',
      required: true,
      immutable: true,
    },
    // Set by the server from the verified caller, so not `userBound`.
    {
      name: 'participantId',
      storage: 'text',
      interpretation: 'plain',
      required: true,
      immutable: true,
    },
    // Signed-out visitors cannot read the user directory, so the name is kept here.
    { name: 'participantName', storage: 'text', interpretation: 'plain' },
    { name: 'fileName', storage: 'text', interpretation: 'plain', maxLength: 120 },
    { name: 'utcDay', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'slot', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    { name: 'publicScore', storage: 'number', interpretation: 'plain', immutable: true },
    { name: 'rowCount', storage: 'number', interpretation: 'plain', immutable: true },
  ],
  uniqueOn: ['competitionId', 'participantId', 'utcDay', 'slot'],
  permissions: READ_ONLY,
}
