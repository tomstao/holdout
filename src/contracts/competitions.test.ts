import type { CollectionSchema } from 'deepspace/schema'
import { describe, expect, it } from 'vitest'
import { METRICS, TASK_TYPES } from '../domain/metrics'
import { schemas } from '../schemas'
import {
  answerKeyRecord,
  COMPETITION_STATUSES,
  competitionRecord,
  finalStandingRecord,
  privateScoreRecord,
  submissionRecord,
  type CompetitionRecord,
} from './competitions'
import { recordSchemas } from './records'

const file = (name: string) => ({ key: `apps/app_x/users/u1/c1/${name}`, name, bytes: 1200 })

const competition: CompetitionRecord = {
  title: 'Palmer Penguins',
  summary: 'Predict the species of a penguin from its measurements.',
  description: '',
  taskType: 'classification',
  metric: 'macro_f1',
  idColumn: 'id',
  targetColumn: 'species',
  labels: ['Adelie', 'Chinstrap', 'Gentoo'],
  deadline: 1_795_000_000_000,
  dailyLimit: 5,
  scoreDecimals: 4,
  testRows: 100,
  publicRows: 30,
  privateRows: 70,
  status: 'open',
  hostId: 'user_1',
  hostName: 'Ada',
  files: { train: file('train.csv'), test: file('test.csv'), sample: file('sample.csv') },
}

describe('record contracts', () => {
  it('accepts an open classification competition', () => {
    expect(competitionRecord.parse(competition)).toEqual(competition)
  })

  it('accepts a closed regression competition, which has no labels', () => {
    const { labels: _labels, ...withoutLabels } = competition
    const closed = {
      ...withoutLabels,
      taskType: 'regression',
      metric: 'rmse',
      status: 'closed',
      closingStartedAt: 1_795_000_060_000,
      closedAt: 1_795_000_065_000,
    }
    expect(competitionRecord.parse(closed)).toEqual(closed)
  })

  it('wants a missing value left out, not null: the record room drops nulls on read', () => {
    expect(competitionRecord.safeParse({ ...competition, closedAt: null }).success).toBe(false)
    expect(competitionRecord.safeParse({ ...competition, labels: null }).success).toBe(false)
  })

  it('holds a competition to the limits of the spec', () => {
    const refused = (change: Partial<Record<keyof CompetitionRecord, unknown>>) =>
      !competitionRecord.safeParse({ ...competition, ...change }).success
    expect(refused({ title: 'ab' })).toBe(true)
    expect(refused({ title: 'x'.repeat(81) })).toBe(true)
    expect(refused({ summary: 'too short' })).toBe(true)
    expect(refused({ description: 'x'.repeat(5001) })).toBe(true)
    expect(refused({ dailyLimit: 0 })).toBe(true)
    expect(refused({ dailyLimit: 21 })).toBe(true)
    expect(refused({ scoreDecimals: 1 })).toBe(true)
    expect(refused({ scoreDecimals: 7 })).toBe(true)
    expect(refused({ deadline: 1.5 })).toBe(true)
    expect(refused({ metric: 'auc' })).toBe(true)
    expect(refused({ status: 'archived' })).toBe(true)
    expect(refused({ hostId: '' })).toBe(true)
    expect(refused({ files: { train: file('train.csv') } })).toBe(true)
  })

  it('accepts an answer key and refuses an unknown split', () => {
    const key = {
      competitionId: 'c1',
      rows: [
        ['t1', 'Adelie', 'public'],
        ['t2', 'Gentoo', 'private'],
        ['t3', 'Gentoo', 'ignored'],
      ],
      rowCount: 3,
    }
    expect(answerKeyRecord.parse(key)).toEqual(key)
    expect(answerKeyRecord.safeParse({ ...key, rows: [['t1', 'Adelie', 'test']] }).success).toBe(
      false,
    )
  })

  it('accepts a submission and checks its day and slot', () => {
    const submission = {
      competitionId: 'c1',
      participantId: 'user_2',
      participantName: 'Grace',
      fileName: 'predictions.csv',
      utcDay: '2026-11-19',
      slot: 1,
      publicScore: 0.8679207920792079,
      rowCount: 100,
    }
    expect(submissionRecord.parse(submission)).toEqual(submission)
    expect(submissionRecord.safeParse({ ...submission, utcDay: '2026-11-9' }).success).toBe(false)
    expect(submissionRecord.safeParse({ ...submission, utcDay: '19/11/2026' }).success).toBe(false)
    expect(submissionRecord.safeParse({ ...submission, slot: 0 }).success).toBe(false)
    expect(submissionRecord.safeParse({ ...submission, slot: 21 }).success).toBe(false)
  })

  it('accepts a private score and a final standing', () => {
    const score = {
      submissionId: 's1',
      competitionId: 'c1',
      participantId: 'user_2',
      privateScore: 0.86,
    }
    expect(privateScoreRecord.parse(score)).toEqual(score)

    const standing = {
      competitionId: 'c1',
      participantId: 'user_2',
      participantName: 'Grace',
      rank: 1,
      finalScore: 0.86,
      publicRank: 2,
      publicScore: 0.87,
      submissionCount: 4,
      chosen: [{ submissionId: 's1', publicScore: 0.87, privateScore: 0.86 }],
    }
    expect(finalStandingRecord.parse(standing)).toEqual(standing)
    expect(finalStandingRecord.safeParse({ ...standing, rank: 0 }).success).toBe(false)
    expect(finalStandingRecord.safeParse({ ...standing, chosen: [] }).success).toBe(false)
  })

  it('drops a field the contract does not name', () => {
    const parsed = privateScoreRecord.parse({
      submissionId: 's1',
      competitionId: 'c1',
      participantId: 'user_2',
      privateScore: 0.5,
      answer: 'Adelie',
    })
    expect(parsed).not.toHaveProperty('answer')
  })
})

const APP_COLLECTIONS = [
  'competitions',
  'answer_keys',
  'submissions',
  'private_scores',
  'final_standings',
] as const
const ROLES = ['*', 'viewer', 'member', 'admin']

function schemaOf(name: string): CollectionSchema {
  const schema = schemas.find((candidate) => candidate.name === name)
  if (!schema) throw new Error(`src/schemas.ts has no schema named "${name}"`)
  return schema
}

function selectOptions(collection: string, column: string): unknown {
  const found = schemaOf(collection).columns.find((candidate) => candidate.name === column)
  const interpretation = found?.interpretation
  return typeof interpretation === 'object' && 'options' in interpretation
    ? interpretation.options
    : undefined
}

describe('collection schemas', () => {
  it('registers a contract for each of the five collections and nothing else', () => {
    expect(Object.keys(recordSchemas).sort()).toEqual([...APP_COLLECTIONS].sort())
    for (const name of APP_COLLECTIONS) expect(schemaOf(name).name).toBe(name)
  })

  it('gives every role, the owner included, an explicit rule on every collection', () => {
    for (const name of APP_COLLECTIONS) {
      expect(Object.keys(schemaOf(name).permissions).sort(), name).toEqual([...ROLES].sort())
    }
  })

  it('lets no role write to any collection', () => {
    for (const name of APP_COLLECTIONS) {
      for (const role of ROLES) {
        const rule = schemaOf(name).permissions[role]
        expect(rule, `${name} / ${role}`).toMatchObject({
          create: false,
          update: false,
          delete: false,
        })
        expect(rule?.writableFields, `${name} / ${role}`).toBeUndefined()
      }
    }
  })

  it('closes answer_keys and private_scores to every role', () => {
    for (const name of ['answer_keys', 'private_scores']) {
      for (const role of ROLES) {
        expect(schemaOf(name).permissions[role]?.read, `${name} / ${role}`).toBe(false)
      }
    }
  })

  it('lets everyone, signed in or not, read the other three', () => {
    for (const name of ['competitions', 'submissions', 'final_standings']) {
      for (const role of ROLES) {
        expect(schemaOf(name).permissions[role]?.read, `${name} / ${role}`).toBe(true)
      }
    }
  })

  it('declares no ownership or visibility rule that could widen access', () => {
    for (const name of APP_COLLECTIONS) {
      const schema = schemaOf(name)
      expect(schema.ownerField, name).toBeUndefined()
      expect(schema.collaboratorsField, name).toBeUndefined()
      expect(schema.teamField, name).toBeUndefined()
      expect(schema.visibilityField, name).toBeUndefined()
      expect(
        schema.columns.filter((column) => column.userBound),
        name,
      ).toEqual([])
    }
  })

  it('enforces the uniqueness the design relies on', () => {
    expect(schemaOf('competitions').uniqueOn).toBeUndefined()
    expect(schemaOf('answer_keys').uniqueOn).toEqual(['competitionId'])
    expect(schemaOf('submissions').uniqueOn).toEqual([
      'competitionId',
      'participantId',
      'utcDay',
      'slot',
    ])
    expect(schemaOf('private_scores').uniqueOn).toEqual(['submissionId'])
    expect(schemaOf('final_standings').uniqueOn).toEqual(['competitionId', 'participantId'])
  })

  it('offers the same choices in the columns as in the contracts', () => {
    expect(selectOptions('competitions', 'taskType')).toEqual([...TASK_TYPES])
    expect(selectOptions('competitions', 'metric')).toEqual([...METRICS])
    expect(selectOptions('competitions', 'status')).toEqual([...COMPETITION_STATUSES])
  })
})
