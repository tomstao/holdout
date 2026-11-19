/**
 * The local check of a host's files, before anything is sent: the same domain
 * code the server runs (src/domain/dataset.ts), arranged for the form.
 *
 * A file is first looked at on its own, so the host sees its columns the
 * moment it is dropped. Once all three are there and the columns are chosen,
 * the whole dataset is checked. The server checks again and is the authority.
 */
import { datasetIssues } from '../../contracts/file-issues'
import type { Issue } from '../../contracts/result'
import { megabytes, parseCsv } from '../../domain/csv'
import {
  DATASET_FILE_LIMITS,
  DATASET_FILES,
  validateDataset,
  type Dataset,
  type DatasetFile,
} from '../../domain/dataset'
import type { TaskType } from '../../domain/metrics'
import { USAGE_COLUMN } from '../../domain/split'

/** A file the host picked, read as text. */
export interface PickedFile {
  name: string
  text: string
}

export type PickedFiles = Partial<Record<DatasetFile, PickedFile>>

/** What a file is on its own. */
export type FileLook =
  { ok: true; header: string[]; rows: number; summary: string } | { ok: false; issues: Issue[] }

const plural = (count: number, noun: string) =>
  `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`

/** A file too large to be worth reading into memory: over twice its limit. */
export function tooLargeToRead(kind: DatasetFile, bytes: number): Issue | undefined {
  const limit = DATASET_FILE_LIMITS[kind].maxBytes
  return bytes > 2 * limit
    ? {
        path: [kind],
        message: `The file is ${megabytes(bytes)}; the limit is ${megabytes(limit)}.`,
      }
    : undefined
}

/** Parse one file with its own limits. */
export function lookAtFile(kind: DatasetFile, file: PickedFile): FileLook {
  const parsed = parseCsv(file.text, DATASET_FILE_LIMITS[kind])
  if (!parsed.ok) {
    return {
      ok: false,
      issues: datasetIssues({
        ok: false,
        issues: parsed.issues.map((issue) => ({ file: kind, ...issue })),
        omitted: parsed.omitted,
        omittedByFile: { train: 0, test: 0, solution: 0, [kind]: parsed.omitted },
      }),
    }
  }
  const { header, rows } = parsed.value
  return {
    ok: true,
    header,
    rows: rows.length,
    summary: `${plural(rows.length, 'row')}, ${plural(header.length, 'column')}`,
  }
}

const isUsage = (name: string) => name.trim().toLowerCase() === USAGE_COLUMN.toLowerCase()

/**
 * The columns of solution.csv the host can pick as ID and target: every named
 * column except `Usage`.
 */
export function columnChoices(solutionHeader: readonly string[]): string[] {
  return solutionHeader.filter((name) => name !== '' && !isUsage(name))
}

export interface CheckSettings {
  taskType: TaskType
  idColumn: string
  targetColumn: string
  publicShare: number
}

export type DatasetCheck =
  | { state: 'incomplete' }
  | { state: 'ok'; dataset: Dataset }
  | { state: 'problems'; issues: Record<DatasetFile, Issue[]> }

/**
 * Check the dataset once the three files and the two columns are known. The
 * split shown here is a preview with a fixed seed: the row counts are the
 * ones the server will produce, which rows are public is not.
 */
export function checkDataset(settings: CheckSettings, files: PickedFiles): DatasetCheck {
  const { train, test, solution } = files
  if (!train || !test || !solution || !settings.idColumn || !settings.targetColumn) {
    return { state: 'incomplete' }
  }
  const result = validateDataset({
    ...settings,
    seed: 1,
    files: { train: train.text, test: test.text, solution: solution.text },
  })
  if (result.ok) return { state: 'ok', dataset: result.value }
  return { state: 'problems', issues: groupByFile(datasetIssues(result)) }
}

/** Sort issues under the file their path starts with; the rest are returned as `other`. */
export function groupByFile(issues: readonly Issue[]): Record<DatasetFile, Issue[]> {
  const grouped: Record<DatasetFile, Issue[]> = { train: [], test: [], solution: [] }
  for (const issue of issues) {
    const file = DATASET_FILES.find((kind) => kind === issue.path?.[0])
    if (file) grouped[file].push(issue)
  }
  return grouped
}
