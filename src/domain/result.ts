/**
 * The result of a domain function that can reject its input.
 *
 * Domain code never throws for bad input (a malformed CSV, an unknown ID): it
 * returns the problems, each with the place it was found, so the browser can
 * show them next to the file and an action can map them to a contract failure
 * (src/contracts/result.ts).
 */

/** One problem in an uploaded file. */
export interface FileIssue {
  /** The file it belongs to, set by code that checks several files together. */
  file?: string
  /** Row as a spreadsheet numbers it: the header is row 1, the first data row is row 2. */
  row?: number
  /** Column name. */
  column?: string
  /** A full sentence, safe to show as is. It does not repeat the row or the column. */
  message: string
}

export interface Ok<T> {
  ok: true
  value: T
}

export interface Rejected {
  ok: false
  /** The first problems found, at most `MAX_ISSUES`. Never empty. */
  issues: FileIssue[]
  /** How many more problems were found and left out of `issues`. */
  omitted: number
}

export type Result<T> = Ok<T> | Rejected

/** Problems reported per file; the rest are counted (docs/spec.md, F1). */
export const MAX_ISSUES = 20

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

/** Reject with a single problem. */
export function reject(issue: FileIssue): Rejected {
  return { ok: false, issues: [issue], omitted: 0 }
}

/**
 * Collects problems while a file is checked, keeping the first `limit` and
 * counting the rest, so a file with 50,000 bad rows costs 20 messages.
 */
export interface IssueLog {
  add(issue: FileIssue): void
  /** Take over another check's problems, adding `extra` (such as the file) to each. */
  absorb(rejected: Rejected, extra?: Partial<FileIssue>): void
  /** Every problem added, including the ones left out. */
  readonly count: number
  /** The collected problems as a rejection. Call it only when `count > 0`. */
  rejection(): Rejected
}

export function issueLog(limit: number = MAX_ISSUES): IssueLog {
  const issues: FileIssue[] = []
  let count = 0
  const add = (issue: FileIssue): void => {
    count++
    if (issues.length < limit) issues.push(issue)
  }
  return {
    add,
    absorb(rejected, extra) {
      for (const issue of rejected.issues) add({ ...extra, ...issue })
      count += rejected.omitted
    },
    get count() {
      return count
    },
    rejection() {
      return { ok: false, issues: [...issues], omitted: count - issues.length }
    },
  }
}
