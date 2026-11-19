/**
 * The contract of the submit action (spec F2). The record shapes it writes,
 * `submissions` and `private_scores`, are in ./competitions.ts.
 */
import { z } from 'zod'
import { PREDICTIONS_LIMITS } from '../domain/predictions'
import { defineAction } from './define'

export const submitPredictions = defineAction({
  description:
    'Score a predictions file against a competition’s answer key. Any signed-in user except the host may call it, up to the daily limit.',
  input: z.object({
    competitionId: z.string().min(1).max(100),
    /** The file's name on the participant's machine, shown in their list of submissions. */
    fileName: z.string().trim().min(1).max(120),
    /** `max` counts characters, which is never more than the bytes; the domain checks bytes. */
    csv: z.string().min(1, 'The file is empty.').max(PREDICTIONS_LIMITS.maxBytes),
  }),
  output: z.object({
    submissionId: z.string().min(1),
    /** Unrounded. The private score is never returned. */
    publicScore: z.number(),
    /** This submission's number today, 1 to `dailyLimit`. */
    slot: z.number().int().min(1),
    dailyLimit: z.number().int().min(1),
    /** When today's count resets: the next 00:00 UTC, epoch milliseconds. */
    resetsAt: z.number().int(),
  }),
})
