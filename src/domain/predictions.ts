/**
 * Checks a participant's predictions file (spec F2).
 *
 * In two steps, because the browser does not have the answer key:
 *   - `checkPredictionsFile` needs only what the competition publishes (its
 *     columns, task, labels and number of test rows). The browser runs it
 *     before anything is sent, and the server runs it again.
 *   - `matchAnswerKey` needs the key, so only the server runs it: every test
 *     ID exactly once, no unknown ID.
 *
 * IDs and predictions are compared without surrounding spaces, as in
 * src/domain/dataset.ts.
 */
import { fileRow, findColumn, parseCsv, type CsvLimits } from './csv'
import { DATASET_LIMITS, parseNumber, type AnswerKeyRow } from './dataset'
import type { TaskType } from './metrics'
import { issueLog, ok, type Result } from './result'

/** A predictions file is at most 2 MB (spec, "Limits and numbers"). */
export const PREDICTIONS_LIMITS: CsvLimits = {
  maxBytes: 2_000_000,
  maxRows: DATASET_LIMITS.solutionRows,
}

/** What a competition publishes about the file it expects. */
export interface PredictionsFormat {
  idColumn: string
  targetColumn: string
  taskType: TaskType
  /** Classification: the labels a prediction may take. */
  labels?: readonly string[]
  /** The number of test rows, which is public; the IDs are not needed to count. */
  testRows: number
}

/** The file's rows, trimmed, in file order. */
export interface PredictionRows {
  ids: string[]
  predictions: string[]
}

/** A value as it appears in a message: quoted, and cut if it is long. */
function shown(value: string): string {
  return value.length > 40 ? `"${value.slice(0, 40)}…"` : `"${value}"`
}

function labelList(labels: readonly string[]): string {
  const listed = labels.slice(0, 8).join(', ')
  return labels.length > 8 ? `${listed} and ${labels.length - 8} more` : listed
}

const plural = (count: number, noun: string) =>
  `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`

/** Check what can be checked without the answer key. */
export function checkPredictionsFile(
  text: string,
  format: PredictionsFormat,
): Result<PredictionRows> {
  const parsed = parseCsv(text, PREDICTIONS_LIMITS)
  if (!parsed.ok) return parsed
  const { header, rows } = parsed.value
  const { idColumn, targetColumn } = format
  const issues = issueLog()

  const idAt = findColumn(header, idColumn)
  const targetAt = findColumn(header, targetColumn)
  for (const [at, name] of [
    [idAt, idColumn],
    [targetAt, targetColumn],
  ] as const) {
    if (at === -1) {
      issues.add({
        row: 1,
        column: name,
        message: `The file has no column with this name. Its columns are: ${header.map(shown).join(', ')}.`,
      })
    }
  }
  if (idAt !== -1 && targetAt !== -1 && header.length !== 2) {
    issues.add({
      row: 1,
      message: `The file must have exactly 2 columns, ${shown(idColumn)} and ${shown(targetColumn)}; it has ${header.length}.`,
    })
  }
  if (idAt === -1 || targetAt === -1) return issues.rejection()

  const allowed = format.labels ? new Set(format.labels) : undefined
  const firstRow = new Map<string, number>()
  const ids: string[] = []
  const predictions: string[] = []
  rows.forEach((row, index) => {
    const at = fileRow(index)
    const id = (row[idAt] ?? '').trim()
    const prediction = (row[targetAt] ?? '').trim()
    ids.push(id)
    predictions.push(prediction)

    if (id === '') issues.add({ row: at, column: idColumn, message: 'The ID is empty.' })
    else {
      const earlier = firstRow.get(id)
      if (earlier === undefined) firstRow.set(id, at)
      else {
        issues.add({
          row: at,
          column: idColumn,
          message: `The ID ${shown(id)} is already used in row ${earlier}.`,
        })
      }
    }

    if (prediction === '') {
      issues.add({ row: at, column: targetColumn, message: 'The prediction is empty.' })
    } else if (format.taskType === 'regression') {
      if (parseNumber(prediction) === undefined) {
        issues.add({
          row: at,
          column: targetColumn,
          message: `${shown(prediction)} is not a number.`,
        })
      }
    } else if (allowed && !allowed.has(prediction)) {
      issues.add({
        row: at,
        column: targetColumn,
        message: `${shown(prediction)} is not one of the labels: ${labelList(format.labels ?? [])}.`,
      })
    }
  })

  if (rows.length !== format.testRows) {
    issues.add({
      message: `The file has ${plural(rows.length, 'row')}; the competition has ${plural(format.testRows, 'test row')}.`,
    })
  }

  return issues.count > 0 ? issues.rejection() : ok({ ids, predictions })
}

/**
 * Line the predictions up with the answer key: every test ID exactly once and
 * no other. Returns the predictions in the key's order.
 */
export function matchAnswerKey(
  rows: PredictionRows,
  key: readonly AnswerKeyRow[],
  idColumn: string,
): Result<string[]> {
  const issues = issueLog()
  const predictionOf = new Map<string, string>()
  rows.ids.forEach((id, index) => predictionOf.set(id, rows.predictions[index] ?? ''))

  const testIds = new Set(key.map(([id]) => id))
  rows.ids.forEach((id, index) => {
    if (!testIds.has(id)) {
      issues.add({
        row: fileRow(index),
        column: idColumn,
        message: `The ID ${shown(id)} is not a test ID.`,
      })
    }
  })

  const aligned: string[] = []
  for (const [id] of key) {
    const prediction = predictionOf.get(id)
    if (prediction === undefined) {
      issues.add({ column: idColumn, message: `The test ID ${shown(id)} has no prediction.` })
    } else aligned.push(prediction)
  }

  return issues.count > 0 ? issues.rejection() : ok(aligned)
}

/** Both checks, as the server runs them. */
export function validatePredictions(
  text: string,
  format: PredictionsFormat,
  key: readonly AnswerKeyRow[],
): Result<string[]> {
  const checked = checkPredictionsFile(text, format)
  if (!checked.ok) return checked
  return matchAnswerKey(checked.value, key, format.idColumn)
}
