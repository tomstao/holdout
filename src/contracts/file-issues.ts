/**
 * Turns the problems the domain found in a host's files into the `issues` of
 * an action failure. The browser shows server issues and its own local check
 * through this one shape, so both read the same.
 *
 * An issue's `path` is `[file, 'row N', column]`, with the row and the column
 * left out when the problem is about the whole file. A file with more
 * problems than were reported gets one closing issue with the count.
 */
import { DATASET_FILES, type DatasetRejected } from '../domain/dataset'
import type { Rejected } from '../domain/result'
import type { Issue } from './result'

export function datasetIssues(rejected: DatasetRejected): Issue[] {
  const issues: Issue[] = rejected.issues.map(({ file, row, column, message }) => ({
    path: [
      ...(file === undefined ? [] : [file]),
      ...(row === undefined ? [] : [`row ${row}`]),
      ...(column === undefined ? [] : [column]),
    ],
    message,
  }))
  for (const file of DATASET_FILES) {
    const more = rejected.omittedByFile[file]
    if (more > 0) {
      issues.push({
        path: [file],
        message: `And ${more.toLocaleString('en-US')} more ${more === 1 ? 'problem' : 'problems'} in this file.`,
      })
    }
  }
  return issues
}

/**
 * The same for a single file, such as a predictions file: the path is
 * `['row N', column]`, empty for a problem about the whole file.
 */
export function fileIssues(rejected: Rejected): Issue[] {
  const issues: Issue[] = rejected.issues.map(({ row, column, message }) => ({
    path: [...(row === undefined ? [] : [`row ${row}`]), ...(column === undefined ? [] : [column])],
    message,
  }))
  if (rejected.omitted > 0) {
    const more = rejected.omitted
    issues.push({
      path: [],
      message: `And ${more.toLocaleString('en-US')} more ${more === 1 ? 'problem' : 'problems'} in this file.`,
    })
  }
  return issues
}
