/**
 * Checks the three files a host uploads (train.csv, test.csv, solution.csv)
 * and turns them into what a competition stores: the answer key with its
 * public/private split, the label set, the row counts and a sample
 * submission.
 *
 * The browser runs it for instant feedback and the Worker runs it again as
 * the authority (docs/spec.md, F1). Every problem is reported with its file,
 * row and column, at most 20 per file.
 *
 * IDs, targets and `Usage` values are compared without surrounding spaces.
 */
import {
  columnValues,
  fileRow,
  findColumn,
  formatCsv,
  megabytes,
  parseCsv,
  utf8ByteLength,
  type CsvLimits,
  type CsvTable,
} from './csv'
import type { TaskType } from './metrics'
import { issueLog, type FileIssue, type IssueLog } from './result'
import { assignSplit, parseUsage, USAGE_COLUMN, type Split } from './split'

export const DATASET_FILES = ['train', 'test', 'solution'] as const
export type DatasetFile = (typeof DATASET_FILES)[number]

/** docs/spec.md, "Limits and numbers". Sizes are UTF-8 bytes. */
export const DATASET_LIMITS = {
  trainBytes: 5_000_000,
  testBytes: 2_000_000,
  solutionBytes: 1_500_000,
  solutionRows: 50_000,
  /** The answer key as stored JSON. A Durable Object row holds at most 2 MB. */
  answerKeyBytes: 1_500_000,
} as const

/** One row of the answer key: the test ID, its true target, and where it is scored. */
export type AnswerKeyRow = [id: string, target: string, split: Split]

export interface DatasetInput {
  taskType: TaskType
  /** Column names as they appear in the files' headers. */
  idColumn: string
  targetColumn: string
  /** Share of the rows scored publicly, used when solution.csv has no `Usage` column. */
  publicShare: number
  /** Seed of that split. It must be unpredictable to participants (see split.ts). */
  seed: number
  /** The files' text. */
  files: Readonly<Record<DatasetFile, string>>
}

export interface Dataset {
  answerKey: AnswerKeyRow[]
  /** Classification: every label in solution.csv, sorted. Regression: null. */
  labels: string[] | null
  trainRows: number
  testRows: number
  publicRows: number
  privateRows: number
  ignoredRows: number
  /** True when the split came from the host's `Usage` column. */
  splitByHost: boolean
  /** sample_submission.csv: every test ID with one constant, valid prediction. */
  sampleSubmission: string
}

export interface DatasetRejected {
  ok: false
  /** Problems in file order (train, test, solution), each with its `file`; at most 20 per file. */
  issues: FileIssue[]
  /** Problems left out of `issues`, in total and per file. */
  omitted: number
  omittedByFile: Record<DatasetFile, number>
}

export type DatasetResult = { ok: true; value: Dataset } | DatasetRejected

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * A finite decimal number, as a CSV holds it: `12`, `-0.5`, `.5`, `1e-3`.
 * Not `NaN`, `Infinity`, hexadecimal, an empty field or a number with a
 * thousands separator. Surrounding spaces are ignored.
 */
export function parseNumber(text: string): number | undefined {
  const trimmed = text.trim()
  if (!NUMBER.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** A value as it appears in a message: quoted, and cut if it is long. */
function shown(value: string): string {
  return value.length > 40 ? `"${value.slice(0, 40)}…"` : `"${value}"`
}

/** The limits `parseCsv` applies to each of the three files. */
export const DATASET_FILE_LIMITS: Record<DatasetFile, CsvLimits> = {
  train: { maxBytes: DATASET_LIMITS.trainBytes },
  test: { maxBytes: DATASET_LIMITS.testBytes },
  solution: { maxBytes: DATASET_LIMITS.solutionBytes, maxRows: DATASET_LIMITS.solutionRows },
}

type Report = (issue: FileIssue) => void

/** Parse one file; a file that is not a table, or has no rows, is reported and skipped. */
function readTable(text: string, limits: CsvLimits, log: IssueLog): CsvTable | undefined {
  const parsed = parseCsv(text, limits)
  if (!parsed.ok) {
    log.absorb(parsed)
    return undefined
  }
  if (parsed.value.rows.length === 0) {
    log.add({ message: 'The file has a header but no rows.' })
    return undefined
  }
  return parsed.value
}

/** The values of a named column, trimmed; reports the column if the file lacks it. */
function readColumn(table: CsvTable, name: string, report: Report): string[] | undefined {
  const at = findColumn(table.header, name)
  if (at === -1) {
    const columns = table.header.slice(0, 12).map(shown).join(', ')
    const more = table.header.length > 12 ? ', …' : ''
    report({
      row: 1,
      column: name,
      message: `The file has no column with this name. Its columns are: ${columns}${more}.`,
    })
    return undefined
  }
  return columnValues(table, at).map((value) => value.trim())
}

/** IDs must be present and unique within a file. */
function checkIds(ids: readonly string[], column: string, report: Report): void {
  const firstRow = new Map<string, number>()
  ids.forEach((id, index) => {
    const row = fileRow(index)
    if (id === '') {
      report({ row, column, message: 'The ID is empty.' })
      return
    }
    const earlier = firstRow.get(id)
    if (earlier === undefined) firstRow.set(id, row)
    else report({ row, column, message: `The ID ${shown(id)} is already used in row ${earlier}.` })
  })
}

/** Targets must be numbers (regression) or non-empty labels (classification). */
function checkTargets(
  targets: readonly string[],
  taskType: TaskType,
  column: string,
  report: Report,
): void {
  targets.forEach((target, index) => {
    const row = fileRow(index)
    if (target === '') report({ row, column, message: 'The target is empty.' })
    else if (taskType === 'regression' && parseNumber(target) === undefined) {
      report({ row, column, message: `${shown(target)} is not a number.` })
    }
  })
}

/** Every ID of `ids` must also be in `other`. */
function checkSameIds(
  ids: readonly string[],
  other: ReadonlySet<string>,
  otherName: string,
  column: string,
  report: Report,
): void {
  ids.forEach((id, index) => {
    if (id !== '' && !other.has(id)) {
      report({
        row: fileRow(index),
        column,
        message: `The ID ${shown(id)} is not in ${otherName}.`,
      })
    }
  })
}

/** The host's own split, from the `Usage` column, or undefined if it has problems. */
function readUsage(table: CsvTable, column: string, report: Report): Split[] | undefined {
  let problems = 0
  const values = columnValues(table, findColumn(table.header, column))
  const usage = values.map((value, index): Split => {
    const split = parseUsage(value)
    if (split) return split
    problems++
    report({
      row: fileRow(index),
      column,
      message: `${shown(value.trim())} is not Public, Private or Ignored.`,
    })
    return 'ignored'
  })
  if (problems > 0) return undefined
  for (const [needed, name] of [
    ['public', 'Public'],
    ['private', 'Private'],
  ] as const) {
    if (!usage.includes(needed)) {
      problems++
      report({ row: 1, column, message: `No row is marked ${name}. Both halves need a row.` })
    }
  }
  return problems > 0 ? undefined : usage
}

/** The most frequent of `values` among `allowed`; ties go to the earlier of `allowed`. */
function mostCommon(values: readonly string[], allowed: readonly string[]): string | undefined {
  const counts = new Map<string, number>(allowed.map((label) => [label, 0]))
  for (const value of values) {
    const count = counts.get(value)
    if (count !== undefined) counts.set(value, count + 1)
  }
  let best: string | undefined
  let bestCount = -1
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label
      bestCount = count
    }
  }
  return best
}

/** The mean, written with at most six decimals. */
function meanText(values: readonly string[]): string {
  let sum = 0
  for (const value of values) sum += Number(value)
  return String(Number((sum / values.length).toFixed(6)))
}

export function validateDataset(input: DatasetInput): DatasetResult {
  const { taskType, idColumn, targetColumn } = input
  const logs: Record<DatasetFile, IssueLog> = {
    train: issueLog(),
    test: issueLog(),
    solution: issueLog(),
  }
  const reportTo =
    (file: DatasetFile): Report =>
    (issue) => {
      logs[file].add(issue)
    }

  const train = readTable(input.files.train, DATASET_FILE_LIMITS.train, logs.train)
  const test = readTable(input.files.test, DATASET_FILE_LIMITS.test, logs.test)
  const solution = readTable(input.files.solution, DATASET_FILE_LIMITS.solution, logs.solution)

  // train.csv: IDs and targets.
  let trainTargets: string[] | undefined
  if (train) {
    const report = reportTo('train')
    const ids = readColumn(train, idColumn, report)
    if (ids) checkIds(ids, idColumn, report)
    trainTargets = readColumn(train, targetColumn, report)
    if (trainTargets) checkTargets(trainTargets, taskType, targetColumn, report)
  }

  // test.csv: IDs, and no target.
  let testIds: string[] | undefined
  if (test) {
    const report = reportTo('test')
    testIds = readColumn(test, idColumn, report)
    if (testIds) checkIds(testIds, idColumn, report)
    if (findColumn(test.header, targetColumn) !== -1) {
      report({
        row: 1,
        column: targetColumn,
        message: 'test.csv must not contain the target column. Participants download this file.',
      })
    }
  }

  // solution.csv: IDs, targets and the optional Usage column.
  let solutionIds: string[] | undefined
  let solutionTargets: string[] | undefined
  let usage: Split[] | undefined
  let hasUsage = false
  if (solution) {
    const report = reportTo('solution')
    solutionIds = readColumn(solution, idColumn, report)
    if (solutionIds) checkIds(solutionIds, idColumn, report)
    solutionTargets = readColumn(solution, targetColumn, report)
    if (solutionTargets) checkTargets(solutionTargets, taskType, targetColumn, report)
    const usageColumn = solution.header.find(
      (name) => name.trim().toLowerCase() === USAGE_COLUMN.toLowerCase(),
    )
    hasUsage = usageColumn !== undefined
    if (usageColumn !== undefined) usage = readUsage(solution, usageColumn, report)
    else if (solution.rows.length < 2) {
      report({ message: 'The file needs at least 2 rows to be split into public and private.' })
    }
  }

  // The answer key and the test set must name the same rows.
  if (testIds && solutionIds) {
    checkSameIds(solutionIds, new Set(testIds), 'test.csv', idColumn, reportTo('solution'))
    checkSameIds(testIds, new Set(solutionIds), 'solution.csv', idColumn, reportTo('test'))
  }

  if (
    !trainTargets ||
    !testIds ||
    !solutionIds ||
    !solutionTargets ||
    DATASET_FILES.some((file) => logs[file].count > 0)
  ) {
    return rejection(logs)
  }

  const splits: Split[] =
    usage ??
    assignSplit(
      // Regression has no classes to stratify by.
      taskType === 'classification' ? solutionTargets : solutionTargets.map(() => ''),
      input.publicShare,
      input.seed,
    )
  // The three columns have one entry per row; the fallbacks only satisfy the type checker.
  const targets = solutionTargets
  const answerKey = solutionIds.map((id, index): AnswerKeyRow => [
    id,
    targets[index] ?? '',
    splits[index] ?? 'ignored',
  ])

  const keyBytes = utf8ByteLength(JSON.stringify(answerKey))
  if (keyBytes > DATASET_LIMITS.answerKeyBytes) {
    logs.solution.add({
      message: `The answer key takes ${megabytes(keyBytes)} once prepared for storage; the limit is ${megabytes(DATASET_LIMITS.answerKeyBytes)}. Use shorter IDs or fewer rows.`,
    })
    return rejection(logs)
  }

  const labels = taskType === 'classification' ? [...new Set(solutionTargets)].sort() : null
  const prediction = labels ? (mostCommon(trainTargets, labels) ?? '') : meanText(trainTargets)

  return {
    ok: true,
    value: {
      answerKey,
      labels,
      trainRows: trainTargets.length,
      testRows: testIds.length,
      publicRows: splits.filter((split) => split === 'public').length,
      privateRows: splits.filter((split) => split === 'private').length,
      ignoredRows: splits.filter((split) => split === 'ignored').length,
      splitByHost: hasUsage,
      sampleSubmission: formatCsv(
        [idColumn, targetColumn],
        testIds.map((id) => [id, prediction]),
      ),
    },
  }
}

function rejection(logs: Record<DatasetFile, IssueLog>): DatasetRejected {
  const issues: FileIssue[] = []
  const omittedByFile: Record<DatasetFile, number> = { train: 0, test: 0, solution: 0 }
  let omitted = 0
  for (const file of DATASET_FILES) {
    const rejected = logs[file].rejection()
    for (const issue of rejected.issues) issues.push({ file, ...issue })
    omittedByFile[file] = rejected.omitted
    omitted += rejected.omitted
  }
  return { ok: false, issues, omitted, omittedByFile }
}
