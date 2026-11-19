/**
 * The record shapes of Holdout's five collections, as both runtimes see them
 * (the fields under `record.data`), followed by the contracts of the server
 * actions. The records' storage columns and permissions are in src/schemas/;
 * schema-drift.test.ts keeps the two in step.
 *
 * A field that may be missing is `.optional()`, never `.nullable()`: the
 * record room stores `null` as "no value" and leaves the key out when the row
 * is read back.
 */
import { z } from 'zod'
import { DATASET_LIMITS } from '../domain/dataset'
import { METRIC_INFO, METRICS, TASK_TYPES } from '../domain/metrics'
import { SPLITS } from '../domain/split'
import { defineAction } from './define'

export const COMPETITION_STATUSES = ['open', 'closing', 'closed'] as const
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number]

/** Epoch milliseconds. */
const timestamp = z.number().int().nonnegative()
const count = z.number().int().nonnegative()
const id = z.string().min(1)

/** A file in the host's private folder; `key` is the stored key `appFiles.download` takes. */
export const storedFile = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  bytes: count,
})

export const competitionRecord = z.object({
  title: z.string().min(3).max(80),
  summary: z.string().min(10).max(200),
  description: z.string().max(5000),
  taskType: z.enum(TASK_TYPES),
  metric: z.enum(METRICS),
  idColumn: z.string().min(1),
  targetColumn: z.string().min(1),
  /** Classification: the labels of the answer key, sorted. Absent for regression. */
  labels: z.array(z.string()).optional(),
  deadline: timestamp,
  dailyLimit: z.number().int().min(1).max(20),
  scoreDecimals: z.number().int().min(2).max(6),
  testRows: count,
  publicRows: count,
  privateRows: count,
  status: z.enum(COMPETITION_STATUSES),
  closingStartedAt: timestamp.optional(),
  closedAt: timestamp.optional(),
  hostId: id,
  hostName: z.string(),
  files: z.object({ train: storedFile, test: storedFile, sample: storedFile }),
})

/** `[id, target, split]`, as src/domain/dataset.ts builds it. */
export const answerKeyRow = z.tuple([z.string(), z.string(), z.enum(SPLITS)])

export const answerKeyRecord = z.object({
  competitionId: id,
  rows: z.array(answerKeyRow),
  rowCount: count,
})

export const submissionRecord = z.object({
  competitionId: id,
  participantId: id,
  participantName: z.string(),
  fileName: z.string().max(120),
  /** `YYYY-MM-DD`, the UTC day the submission counts against. */
  utcDay: z.iso.date(),
  /** 1 to the competition's daily limit. */
  slot: z.number().int().min(1).max(20),
  /** Unrounded. */
  publicScore: z.number(),
  rowCount: count,
})

export const privateScoreRecord = z.object({
  submissionId: id,
  competitionId: id,
  participantId: id,
  /** Unrounded. */
  privateScore: z.number(),
})

export const chosenSubmission = z.object({
  submissionId: id,
  publicScore: z.number(),
  privateScore: z.number(),
})

export const finalStandingRecord = z.object({
  competitionId: id,
  participantId: id,
  participantName: z.string(),
  rank: z.number().int().min(1),
  finalScore: z.number(),
  publicRank: z.number().int().min(1),
  publicScore: z.number(),
  submissionCount: z.number().int().min(1),
  chosen: z.array(chosenSubmission).min(1),
})

export type CompetitionRecord = z.output<typeof competitionRecord>
export type StoredFile = z.output<typeof storedFile>
export type AnswerKeyRecord = z.output<typeof answerKeyRecord>
export type SubmissionRecord = z.output<typeof submissionRecord>
export type PrivateScoreRecord = z.output<typeof privateScoreRecord>
export type FinalStandingRecord = z.output<typeof finalStandingRecord>

/**
 * An uploaded CSV. `max` counts characters, which is never more than the
 * byte length, so it only stops a body far over the limit; the domain checks
 * the exact size in bytes.
 *
 * The messages on the fields a person fills in are written to be shown as
 * they are, under the field.
 */
const csvUpload = (maxBytes: number) =>
  z.object({
    /** The file's name on the host's machine, kept for display. */
    name: z.string().min(1).max(120),
    csv: z.string().min(1).max(maxBytes),
  })

export const createCompetition = defineAction({
  description:
    'Create a competition from a train, a test and a solution file. Any signed-in user may call it and becomes the host.',
  input: z
    .object({
      title: z
        .string()
        .trim()
        .min(3, 'Use at least 3 characters.')
        .max(80, 'Use at most 80 characters.'),
      summary: z
        .string()
        .trim()
        .min(10, 'Use at least 10 characters.')
        .max(200, 'Use at most 200 characters.'),
      description: z.string().max(5000, 'Use at most 5,000 characters.').default(''),
      taskType: z.enum(TASK_TYPES),
      metric: z.enum(METRICS),
      /** Column names exactly as they appear in the files' headers. */
      idColumn: z.string().min(1, 'Choose the ID column.').max(100),
      targetColumn: z.string().min(1, 'Choose the target column.').max(100),
      /** Epoch milliseconds; 1 hour to 90 days ahead, checked against the server's clock. */
      deadline: z.number('Choose a date and time.').int().positive(),
      dailyLimit: z
        .number('Enter a whole number from 1 to 20.')
        .int('Enter a whole number from 1 to 20.')
        .min(1, 'Enter a whole number from 1 to 20.')
        .max(20, 'Enter a whole number from 1 to 20.')
        .default(5),
      scoreDecimals: z
        .number('Enter a whole number from 2 to 6.')
        .int('Enter a whole number from 2 to 6.')
        .min(2, 'Enter a whole number from 2 to 6.')
        .max(6, 'Enter a whole number from 2 to 6.')
        .default(4),
      /** Share of the answer key scored publicly when solution.csv has no Usage column. */
      publicShare: z
        .number('Enter a share from 10 to 50%.')
        .min(0.1, 'Enter a share from 10 to 50%.')
        .max(0.5, 'Enter a share from 10 to 50%.')
        .default(0.3),
      files: z.object({
        train: csvUpload(DATASET_LIMITS.trainBytes),
        test: csvUpload(DATASET_LIMITS.testBytes),
        solution: csvUpload(DATASET_LIMITS.solutionBytes),
      }),
    })
    .refine((input) => METRIC_INFO[input.metric].task === input.taskType, {
      path: ['metric'],
      message: 'This metric does not fit the task type.',
    })
    .refine((input) => input.idColumn !== input.targetColumn, {
      path: ['targetColumn'],
      message: 'The target column must differ from the ID column.',
    }),
  output: z.object({ competitionId: z.string().min(1) }),
})
