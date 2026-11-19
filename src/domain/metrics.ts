/**
 * The four metrics a competition can be scored with, and which direction is
 * better for each.
 *
 * Values match scikit-learn: `accuracy_score`, `f1_score(average='macro')`,
 * `root_mean_squared_error` and `mean_absolute_error`. The test compares them
 * with fixtures computed by scripts/fixtures/metrics.py.
 *
 * The functions take the true values and the predictions as two arrays of the
 * same length, row for row. Matching IDs, parsing numbers and refusing bad
 * files happens before (predictions.ts); an empty or uneven pair here is a bug
 * in the caller, so it throws.
 */

export const TASK_TYPES = ['classification', 'regression'] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const METRICS = ['accuracy', 'macro_f1', 'rmse', 'mae'] as const
export type Metric = (typeof METRICS)[number]

export interface MetricInfo {
  /** The name shown to people. */
  name: string
  task: TaskType
  /** Accuracy and F1 rise as predictions improve; errors fall. */
  higherIsBetter: boolean
}

export const METRIC_INFO: Readonly<Record<Metric, MetricInfo>> = {
  accuracy: { name: 'Accuracy', task: 'classification', higherIsBetter: true },
  macro_f1: { name: 'Macro F1', task: 'classification', higherIsBetter: true },
  rmse: { name: 'RMSE', task: 'regression', higherIsBetter: false },
  mae: { name: 'MAE', task: 'regression', higherIsBetter: false },
}

/** The metrics a competition of this task type may choose from. */
export function metricsFor(task: TaskType): Metric[] {
  return METRICS.filter((metric) => METRIC_INFO[metric].task === task)
}

/**
 * Order two scores of the same metric, best first: negative when `a` is the
 * better score, positive when `b` is, 0 when they are equal. Usable as an
 * `Array.prototype.sort` comparator.
 */
export function compareScores(metric: Metric, a: number, b: number): number {
  if (a === b) return 0
  return METRIC_INFO[metric].higherIsBetter === a > b ? -1 : 1
}

/**
 * Visit each row's true value and prediction; returns the number of rows.
 * Throws when the arrays are empty or uneven: that is a bug in the caller.
 */
function eachPair<T>(
  truth: readonly T[],
  predicted: readonly T[],
  visit: (actual: T, guess: T) => void,
): number {
  if (truth.length !== predicted.length) {
    throw new RangeError(
      `A metric needs one prediction per true value: got ${predicted.length} for ${truth.length}.`,
    )
  }
  if (truth.length === 0) throw new RangeError('A metric needs at least one row.')
  // Both arrays have an element at every index below their shared length.
  truth.forEach((actual, index) => {
    visit(actual, predicted[index] as T)
  })
  return truth.length
}

/**
 * A running sum with Neumaier's compensation, so a score does not depend on
 * rounding accumulated over 50,000 rows or on the order of the rows.
 */
function compensatedSum() {
  let sum = 0
  let compensation = 0
  return {
    add(value: number): void {
      const next = sum + value
      compensation += Math.abs(sum) >= Math.abs(value) ? sum - next + value : value - next + sum
      sum = next
    },
    total: (): number => sum + compensation,
  }
}

/** The share of rows predicted exactly right. */
export function accuracy(truth: readonly string[], predicted: readonly string[]): number {
  let right = 0
  const rows = eachPair(truth, predicted, (actual, guess) => {
    if (actual === guess) right++
  })
  return right / rows
}

/**
 * The unweighted mean of each label's F1 score, over every label that occurs
 * in the true values or in the predictions (scikit-learn's default label
 * set). A label that is predicted but never true, or true but never
 * predicted, scores 0 and pulls the mean down.
 */
export function macroF1(truth: readonly string[], predicted: readonly string[]): number {
  // Per label: true positives, and false positives plus false negatives.
  const counts = new Map<string, { hits: number; misses: number }>()
  const count = (label: string) => {
    let entry = counts.get(label)
    if (!entry) {
      entry = { hits: 0, misses: 0 }
      counts.set(label, entry)
    }
    return entry
  }
  eachPair(truth, predicted, (actual, guess) => {
    if (actual === guess) count(actual).hits++
    else {
      count(actual).misses++
      count(guess).misses++
    }
  })
  // F1 = 2·TP / (2·TP + FP + FN). Every label counted has at least one hit or miss.
  const f1 = compensatedSum()
  for (const { hits, misses } of counts.values()) f1.add((2 * hits) / (2 * hits + misses))
  return f1.total() / counts.size
}

/** Root mean squared error. */
export function rmse(truth: readonly number[], predicted: readonly number[]): number {
  const squares = compensatedSum()
  const rows = eachPair(truth, predicted, (actual, guess) => {
    squares.add((actual - guess) ** 2)
  })
  return Math.sqrt(squares.total() / rows)
}

/** Mean absolute error. */
export function mae(truth: readonly number[], predicted: readonly number[]): number {
  const errors = compensatedSum()
  const rows = eachPair(truth, predicted, (actual, guess) => {
    errors.add(Math.abs(actual - guess))
  })
  return errors.total() / rows
}
