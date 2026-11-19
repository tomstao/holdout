/**
 * Reading and writing CSV (RFC 4180), the same code in the browser and the
 * Worker.
 *
 * What the reader accepts, where the RFC leaves room:
 *   - UTF-8 text with or without a byte order mark.
 *   - Rows ending in CR LF, LF or a lone CR, mixed freely.
 *   - A quoted field may hold commas, line breaks and doubled quotes (`""`).
 *   - A quote inside a field that did not start with one is an ordinary
 *     character (`5" nail`), as in Excel and pandas.
 *   - Spaces are part of a field and are kept.
 *   - Blank lines at the end of the file are dropped. A blank line anywhere
 *     else is a row with one empty field.
 *   - A column may have an empty name (pandas writes its index that way), but
 *     no two columns may share a non-empty name.
 *
 * What it refuses: an empty file, a quoted field that never closes, text
 * after a closing quote, a row whose field count differs from the header's,
 * and a file over the byte or row limit.
 *
 * Sizes are UTF-8 bytes, and 1 MB is 1,000,000 bytes.
 */
import { issueLog, ok, reject, type Rejected, type Result } from './result'

export interface CsvLimits {
  /** Largest file accepted, in UTF-8 bytes. */
  maxBytes: number
  /** Most data rows accepted. The header does not count. */
  maxRows?: number
}

export interface CsvTable {
  /** Column names, in file order. */
  header: string[]
  /** Data rows. Each has exactly `header.length` fields. Row `i` is row `i + 2` of the file. */
  rows: string[][]
}

const QUOTE = 0x22
const COMMA = 0x2c
const LF = 0x0a
const CR = 0x0d
const BOM = 0xfeff

/** The row number a spreadsheet shows for data row `index` (the header is row 1). */
export function fileRow(index: number): number {
  return index + 2
}

/** The length of `text` once encoded as UTF-8, without encoding it. */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i)
    if (unit < 0x80) bytes += 1
    else if (unit < 0x800) bytes += 2
    else if (unit >= 0xd800 && unit <= 0xdbff && isLowSurrogate(text.charCodeAt(i + 1))) {
      // A surrogate pair is one code point of four bytes.
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff
}

/** `5 MB`, `1.5 MB`, `5.01 MB`. Rounded up, so a file over a limit never prints as equal to it. */
export function megabytes(bytes: number): string {
  return `${String(Math.ceil(bytes / 10_000) / 100)} MB`
}

/** A file's size for display: `132 B`, `1.3 kB`, `4.82 MB`. */
export function fileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} kB`
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * Parse a CSV file with a header row. Returns the table, or the problems that
 * make the file unusable as a table.
 */
export function parseCsv(text: string, limits: CsvLimits): Result<CsvTable> {
  const bytes = utf8ByteLength(text)
  if (bytes > limits.maxBytes) {
    return reject({
      message: `The file is ${megabytes(bytes)}; the limit is ${megabytes(limits.maxBytes)}.`,
    })
  }
  const maxRows = limits.maxRows ?? Number.POSITIVE_INFINITY

  const records: string[][] = []
  let record: string[] = []
  // Blank lines seen since the last line with content; dropped if the file ends there.
  let trailingBlank = 0

  const end = text.length
  let i = text.charCodeAt(0) === BOM ? 1 : 0
  // The current field is `collected + text.slice(sliceStart, i)`. `collected`
  // is only used by quoted fields, whose text is not one contiguous slice.
  let sliceStart = i
  let collected = ''
  let quoted = false
  let inQuotes = false

  const endField = (at: number): void => {
    record.push(quoted ? collected : text.slice(sliceStart, at))
    collected = ''
    quoted = false
    sliceStart = at + 1
  }

  for (; i < end; i++) {
    const unit = text.charCodeAt(i)

    if (inQuotes) {
      if (unit !== QUOTE) continue
      if (text.charCodeAt(i + 1) === QUOTE) {
        // A doubled quote is one quote character.
        collected += text.slice(sliceStart, i + 1)
        i++
        sliceStart = i + 1
      } else {
        collected += text.slice(sliceStart, i)
        inQuotes = false
      }
      continue
    }

    if (unit === COMMA) {
      endField(i)
    } else if (unit === LF || unit === CR) {
      const blank = record.length === 0 && !quoted && sliceStart === i
      endField(i)
      records.push(record)
      record = []
      if (unit === CR && text.charCodeAt(i + 1) === LF) {
        i++
        sliceStart = i + 1
      }
      if (blank) trailingBlank++
      else {
        trailingBlank = 0
        if (records.length - 1 > maxRows) return tooManyRows(maxRows)
      }
    } else if (quoted) {
      // The quoted field has closed; only a comma or a line break may follow.
      return reject({
        row: records.length + 1,
        message: `Field ${record.length + 1} has text after its closing quote. Quotes inside a quoted value must be doubled ("").`,
      })
    } else if (unit === QUOTE && sliceStart === i) {
      quoted = true
      inQuotes = true
      sliceStart = i + 1
    }
  }

  if (inQuotes) {
    return reject({
      row: records.length + 1,
      message: `Field ${record.length + 1} opens a quote that is never closed.`,
    })
  }
  if (record.length > 0 || quoted || sliceStart < end) {
    // The last row has no line break after it.
    endField(end)
    records.push(record)
    trailingBlank = 0
    if (records.length - 1 > maxRows) return tooManyRows(maxRows)
  }
  records.length -= trailingBlank

  const header = records[0]
  if (!header) return reject({ message: 'The file is empty.' })
  if (header.length === 1 && header[0] === '') {
    return reject({ row: 1, message: 'The first row is empty. It must hold the column names.' })
  }

  const issues = issueLog()
  const seen = new Set<string>()
  for (const name of header) {
    if (name !== '' && seen.has(name)) {
      issues.add({ row: 1, column: name, message: 'This column name appears more than once.' })
    }
    seen.add(name)
  }

  const rows = records.slice(1)
  for (const [index, row] of rows.entries()) {
    if (row.length !== header.length) {
      issues.add({
        row: fileRow(index),
        message: `This row has ${plural(row.length, 'field')}; the header has ${header.length.toLocaleString('en-US')}.`,
      })
    }
  }

  return issues.count > 0 ? issues.rejection() : ok({ header, rows })
}

function tooManyRows(maxRows: number): Rejected {
  return reject({ message: `The file has more than ${plural(maxRows, 'row')}.` })
}

/** Where the column called `name` is, or -1. Names match exactly, including case and spaces. */
export function findColumn(header: readonly string[], name: string): number {
  return header.indexOf(name)
}

/** Every row's value in column `at`, top to bottom. `at` must be a column of the table. */
export function columnValues(table: CsvTable, at: number): string[] {
  // parseCsv only returns rectangular tables, so the fallback is never used.
  return table.rows.map((row) => row[at] ?? '')
}

const NEEDS_QUOTES = /[",\r\n]|^\uFEFF/

function formatField(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function formatRow(fields: readonly string[]): string {
  // A lone empty field would be a blank line, which the reader drops at the end of a file.
  if (fields.length === 1 && fields[0] === '') return '""'
  return fields.map(formatField).join(',')
}

/**
 * Write a table as CSV: LF line ends, a final line break, quotes only where
 * needed. `parseCsv` reads back exactly the header and rows given.
 */
export function formatCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => formatRow(row) + '\n').join('')
}
