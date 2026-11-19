/**
 * Scores a submission on the public rows and on the private rows of the
 * answer key (spec F2). `ignored` rows count in neither.
 *
 * The predictions must already be checked and lined up with the key
 * (src/domain/predictions.ts): one per key row, in the key's order, and a
 * number for regression.
 */
import type { AnswerKeyRow } from './dataset'
import { accuracy, macroF1, mae, rmse, type Metric } from './metrics'

export interface Scores {
  /** Unrounded. */
  publicScore: number
  /** Unrounded. Never shown to the participant before the close. */
  privateScore: number
}

function score(metric: Metric, truth: string[], predicted: string[]): number {
  switch (metric) {
    case 'accuracy':
      return accuracy(truth, predicted)
    case 'macro_f1':
      return macroF1(truth, predicted)
    case 'rmse':
      return rmse(truth.map(Number), predicted.map(Number))
    case 'mae':
      return mae(truth.map(Number), predicted.map(Number))
  }
}

export function scoreSubmission(
  metric: Metric,
  key: readonly AnswerKeyRow[],
  predicted: readonly string[],
): Scores {
  if (predicted.length !== key.length) {
    throw new RangeError(
      `Scoring needs one prediction per key row: got ${predicted.length} for ${key.length}.`,
    )
  }
  const halves = {
    public: { truth: [] as string[], predicted: [] as string[] },
    private: { truth: [] as string[], predicted: [] as string[] },
  }
  key.forEach(([, target, split], index) => {
    if (split === 'ignored') return
    halves[split].truth.push(target)
    halves[split].predicted.push(predicted[index] ?? '')
  })
  return {
    publicScore: score(metric, halves.public.truth, halves.public.predicted),
    privateScore: score(metric, halves.private.truth, halves.private.predicted),
  }
}
