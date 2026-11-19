/**
 * A competition: public to read, written by the create and update actions and
 * by the close job. Times are epoch milliseconds.
 */
import type { CollectionSchema } from 'deepspace/schema'
import { READ_ONLY } from './permissions'

export const competitionsSchema: CollectionSchema = {
  name: 'competitions',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 80 },
    { name: 'summary', storage: 'text', interpretation: 'plain', required: true, maxLength: 200 },
    { name: 'description', storage: 'text', interpretation: 'plain', maxLength: 5000 },
    {
      name: 'taskType',
      storage: 'text',
      interpretation: { kind: 'select', options: ['classification', 'regression'] },
      required: true,
      immutable: true,
    },
    {
      name: 'metric',
      storage: 'text',
      interpretation: { kind: 'select', options: ['accuracy', 'macro_f1', 'rmse', 'mae'] },
      required: true,
      immutable: true,
    },
    { name: 'idColumn', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'targetColumn',
      storage: 'text',
      interpretation: 'plain',
      required: true,
      immutable: true,
    },
    // Classification only: the labels of the answer key. Absent for regression.
    { name: 'labels', storage: 'text', interpretation: { kind: 'json' }, immutable: true },
    { name: 'deadline', storage: 'number', interpretation: 'plain', required: true },
    { name: 'dailyLimit', storage: 'number', interpretation: 'plain', required: true },
    { name: 'scoreDecimals', storage: 'number', interpretation: 'plain', required: true },
    // Counts only: which rows are public stays in answer_keys.
    { name: 'testRows', storage: 'number', interpretation: 'plain', immutable: true },
    { name: 'publicRows', storage: 'number', interpretation: 'plain', immutable: true },
    { name: 'privateRows', storage: 'number', interpretation: 'plain', immutable: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['open', 'closing', 'closed'] },
      required: true,
    },
    // Absent until the close starts and finishes.
    { name: 'closingStartedAt', storage: 'number', interpretation: 'plain' },
    { name: 'closedAt', storage: 'number', interpretation: 'plain' },
    { name: 'hostId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'hostName', storage: 'text', interpretation: 'plain' },
    // { train, test, sample }, each { key, name, bytes }: files in the host's private folder.
    { name: 'files', storage: 'text', interpretation: { kind: 'json' }, immutable: true },
  ],
  permissions: READ_ONLY,
}
