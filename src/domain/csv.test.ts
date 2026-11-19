import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  columnValues,
  fileRow,
  fileSize,
  findColumn,
  formatCsv,
  megabytes,
  parseCsv,
  utf8ByteLength,
  type CsvLimits,
  type CsvTable,
} from './csv'
import type { Rejected } from './result'

const LIMITS = { maxBytes: 1_000_000 }

function table(text: string, limits: CsvLimits = LIMITS): CsvTable {
  const result = parseCsv(text, limits)
  if (!result.ok) throw new Error(`expected a table, got: ${JSON.stringify(result.issues)}`)
  return result.value
}

function rejection(text: string, limits: CsvLimits = LIMITS): Rejected {
  const result = parseCsv(text, limits)
  if (result.ok) throw new Error(`expected a rejection, got: ${JSON.stringify(result.value)}`)
  return result
}

describe('parseCsv: what it reads', () => {
  it('reads a header and rows', () => {
    expect(table('id,species\n1,Adelie\n2,Gentoo\n')).toEqual({
      header: ['id', 'species'],
      rows: [
        ['1', 'Adelie'],
        ['2', 'Gentoo'],
      ],
    })
  })

  it('reads the last row with or without a line break after it', () => {
    expect(table('id,v\n1,a').rows).toEqual([['1', 'a']])
    expect(table('id,v\n1,a\n').rows).toEqual([['1', 'a']])
    expect(table('id,v\n1,').rows).toEqual([['1', '']])
    expect(table('id,v\n1,""').rows).toEqual([['1', '']])
  })

  it('accepts CR LF, LF and a lone CR, mixed', () => {
    expect(table('id,v\r\n1,a\n2,b\r3,c\r\n').rows).toEqual([
      ['1', 'a'],
      ['2', 'b'],
      ['3', 'c'],
    ])
  })

  it('skips a byte order mark', () => {
    expect(table('\uFEFFid,v\n1,a\n').header).toEqual(['id', 'v'])
  })

  it('keeps a byte order mark that is not at the start', () => {
    expect(table('id,v\n\uFEFF1,a\n').rows).toEqual([['\uFEFF1', 'a']])
  })

  it('reads commas, quotes and line breaks inside quoted fields', () => {
    const text = 'id,note\n1,"a, b"\n2,"say ""hi"""\n3,"line one\nline two"\n4,"crlf\r\ninside"\n'
    expect(table(text).rows).toEqual([
      ['1', 'a, b'],
      ['2', 'say "hi"'],
      ['3', 'line one\nline two'],
      ['4', 'crlf\r\ninside'],
    ])
  })

  it('reads quoted fields in any position, empty or not', () => {
    expect(table('"id","v"\n"1",""\n"","2"\n')).toEqual({
      header: ['id', 'v'],
      rows: [
        ['1', ''],
        ['', '2'],
      ],
    })
  })

  it('treats a quote inside an unquoted field as an ordinary character', () => {
    expect(table('id,size\n1,5" nail\n2,a"b"c\n').rows).toEqual([
      ['1', '5" nail'],
      ['2', 'a"b"c'],
    ])
  })

  it('keeps spaces', () => {
    expect(table('id, v\n 1 ,a b \n')).toEqual({ header: ['id', ' v'], rows: [[' 1 ', 'a b ']] })
  })

  it('drops blank lines at the end of the file', () => {
    expect(table('id,v\n1,a\n\n\r\n\n').rows).toEqual([['1', 'a']])
  })

  it('reads a blank line in a one-column file as an empty value', () => {
    expect(table('id\n1\n\n3\n').rows).toEqual([['1'], [''], ['3']])
  })

  it('reads a header with no rows', () => {
    expect(table('id,v\n')).toEqual({ header: ['id', 'v'], rows: [] })
    expect(table('id,v')).toEqual({ header: ['id', 'v'], rows: [] })
  })

  it('allows unnamed columns, as pandas writes its index', () => {
    expect(table(',id,\n0,1,x\n').header).toEqual(['', 'id', ''])
  })
})

describe('parseCsv: what it refuses', () => {
  it('refuses an empty file', () => {
    for (const text of ['', '\uFEFF', '\n', '\r\n\r\n']) {
      expect(rejection(text)).toEqual({
        ok: false,
        issues: [{ message: 'The file is empty.' }],
        omitted: 0,
      })
    }
  })

  it('refuses an empty first row', () => {
    expect(rejection('\n1,a\n').issues).toEqual([
      { row: 1, message: 'The first row is empty. It must hold the column names.' },
    ])
  })

  it('refuses a quoted field that never closes, naming the row it starts on', () => {
    expect(rejection('id,v\n1,a\n2,"open\n3,c\n').issues).toEqual([
      { row: 3, message: 'Field 2 opens a quote that is never closed.' },
    ])
  })

  it('refuses text after a closing quote', () => {
    const issues = rejection('id,v\n1,"a"b\n').issues
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ row: 2 })
    expect(issues[0]?.message).toContain('Field 2 has text after its closing quote')
    expect(rejection('id,v\n"1"" ,a\n').issues[0]?.message).toContain('never closed')
    expect(rejection('"id"x,v\n').issues[0]).toMatchObject({ row: 1 })
    expect(rejection('id,v\n1,"a""b"c"\n').issues[0]).toMatchObject({ row: 2 })
  })

  it('reports each row whose field count differs from the header', () => {
    expect(rejection('id,v,w\n1,a\n2,b,c\n3,d,e,f\n\n5,g,h\n')).toEqual({
      ok: false,
      issues: [
        { row: 2, message: 'This row has 2 fields; the header has 3.' },
        { row: 4, message: 'This row has 4 fields; the header has 3.' },
        { row: 5, message: 'This row has 1 field; the header has 3.' },
      ],
      omitted: 0,
    })
  })

  it('reports the first 20 problems and counts the rest', () => {
    const text = 'id,v\n' + '1\n'.repeat(50)
    const result = rejection(text)
    expect(result.issues).toHaveLength(20)
    expect(result.issues[19]).toMatchObject({ row: 21 })
    expect(result.omitted).toBe(30)
  })

  it('refuses two columns with the same name', () => {
    expect(rejection('id,v,id,v,id\n1,2,3,4,5\n').issues).toEqual([
      { row: 1, column: 'id', message: 'This column name appears more than once.' },
      { row: 1, column: 'v', message: 'This column name appears more than once.' },
      { row: 1, column: 'id', message: 'This column name appears more than once.' },
    ])
  })
})

describe('parseCsv: limits', () => {
  it('accepts a file of exactly the byte limit and refuses one byte more', () => {
    const text = 'id\n' + '1\n'.repeat(10)
    expect(parseCsv(text, { maxBytes: text.length }).ok).toBe(true)
    expect(rejection(text, { maxBytes: text.length - 1 }).issues).toEqual([
      { message: 'The file is 0.01 MB; the limit is 0.01 MB.' },
    ])
  })

  it('counts bytes, not characters', () => {
    const text = 'id\né\n' // 5 characters, 6 bytes
    expect(parseCsv(text, { maxBytes: 6 }).ok).toBe(true)
    expect(parseCsv(text, { maxBytes: 5 }).ok).toBe(false)
  })

  it('names both sizes when a file is too large', () => {
    const text = 'id\n' + '123456789\n'.repeat(620_000)
    expect(rejection(text, { maxBytes: 5_000_000 }).issues).toEqual([
      { message: 'The file is 6.21 MB; the limit is 5 MB.' },
    ])
  })

  it('accepts exactly the row limit and refuses one row more', () => {
    const text = 'id\n1\n2\n3\n'
    expect(table(text, { ...LIMITS, maxRows: 3 }).rows).toHaveLength(3)
    expect(rejection(text, { ...LIMITS, maxRows: 2 }).issues).toEqual([
      { message: 'The file has more than 2 rows.' },
    ])
    expect(rejection('id\n1\n2', { ...LIMITS, maxRows: 1 }).issues).toEqual([
      { message: 'The file has more than 1 row.' },
    ])
  })

  it('does not count blank lines at the end against the row limit', () => {
    expect(table('id\n1\n2\n\n\n\n', { ...LIMITS, maxRows: 2 }).rows).toHaveLength(2)
  })

  it('writes large limits with separators', () => {
    const text = 'id\n' + '1\n'.repeat(50_001)
    expect(rejection(text, { ...LIMITS, maxRows: 50_000 }).issues).toEqual([
      { message: 'The file has more than 50,000 rows.' },
    ])
  })
})

describe('helpers', () => {
  it('numbers rows as a spreadsheet does', () => {
    expect(fileRow(0)).toBe(2)
  })

  it('finds a column by its exact name', () => {
    const header = ['id', 'Species', ' spaced']
    expect(findColumn(header, 'id')).toBe(0)
    expect(findColumn(header, 'Species')).toBe(1)
    expect(findColumn(header, 'species')).toBe(-1)
    expect(findColumn(header, 'spaced')).toBe(-1)
  })

  it('reads one column top to bottom', () => {
    const penguins = table('id,species\n1,Adelie\n2,Gentoo\n')
    expect(columnValues(penguins, 1)).toEqual(['Adelie', 'Gentoo'])
    expect(columnValues(penguins, findColumn(penguins.header, 'id'))).toEqual(['1', '2'])
  })

  it('prints megabytes, rounding up', () => {
    expect(megabytes(5_000_000)).toBe('5 MB')
    expect(megabytes(1_500_000)).toBe('1.5 MB')
    expect(megabytes(5_000_001)).toBe('5.01 MB')
    expect(megabytes(1)).toBe('0.01 MB')
  })

  it('prints a file size in the unit that fits', () => {
    expect(fileSize(0)).toBe('0 B')
    expect(fileSize(999)).toBe('999 B')
    expect(fileSize(1000)).toBe('1.0 kB')
    expect(fileSize(1340)).toBe('1.3 kB')
    expect(fileSize(999_999)).toBe('1000.0 kB')
    expect(fileSize(4_816_000)).toBe('4.82 MB')
  })

  it('measures UTF-8 length', () => {
    expect(utf8ByteLength('')).toBe(0)
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('é')).toBe(2)
    expect(utf8ByteLength('€')).toBe(3)
    expect(utf8ByteLength('😀')).toBe(4)
    // A lone surrogate is encoded as U+FFFD, three bytes.
    expect(utf8ByteLength('\uD83D')).toBe(3)
    expect(utf8ByteLength('\uDE00a')).toBe(4)
  })
})

describe('formatCsv', () => {
  it('quotes only what needs quoting', () => {
    expect(
      formatCsv(
        ['id', 'note'],
        [
          ['1', 'plain'],
          ['2', 'a, b'],
          ['3', 'say "hi"'],
          ['4', 'two\nlines'],
          ['5', ' spaces kept '],
          ['6', ''],
        ],
      ),
    ).toBe('id,note\n1,plain\n2,"a, b"\n3,"say ""hi"""\n4,"two\nlines"\n5, spaces kept \n6,\n')
  })

  it('writes a lone empty field as "" so it is not a blank line', () => {
    expect(formatCsv(['id'], [[''], ['']])).toBe('id\n""\n""\n')
  })
})

// Text built from the characters the format treats specially, plus ordinary ones.
const cell = fc.string({
  unit: fc.constantFrom('"', ',', '\n', '\r', ' ', '\uFEFF', 'a', 'B', '7', 'é', '😀'),
  maxLength: 6,
})

const tables = fc
  .uniqueArray(cell, { minLength: 1, maxLength: 5 })
  .filter((header) => !(header.length === 1 && header[0] === ''))
  .chain((header) =>
    fc.record({
      header: fc.constant(header),
      rows: fc.array(fc.array(cell, { minLength: header.length, maxLength: header.length }), {
        maxLength: 8,
      }),
    }),
  )

describe('properties', () => {
  it('formatting a table and parsing it gives the same table', () => {
    fc.assert(
      fc.property(tables, ({ header, rows }) => {
        expect(parseCsv(formatCsv(header, rows), LIMITS)).toEqual({
          ok: true,
          value: { header, rows },
        })
      }),
      { numRuns: 500 },
    )
  })

  it('the line ending does not change what is read', () => {
    fc.assert(
      fc.property(tables, fc.constantFrom('\r\n', '\r'), ({ header, rows }, ending) => {
        // Only the row separators: line breaks inside quoted fields must stay as they are.
        const text = [header, ...rows].map((row) => formatCsv(row, []).slice(0, -1)).join(ending)
        expect(parseCsv(text, LIMITS)).toEqual({ ok: true, value: { header, rows } })
      }),
      { numRuns: 300 },
    )
  })

  it('any text gives a rectangular table or at most 20 problems, and never throws', () => {
    const anyText = fc.string({
      unit: fc.constantFrom('"', ',', '\n', '\r', 'a', ''),
      maxLength: 60,
    })
    fc.assert(
      fc.property(anyText, (text) => {
        const result = parseCsv(text, LIMITS)
        if (result.ok) {
          const width = result.value.header.length
          expect(width).toBeGreaterThan(0)
          expect(result.value.rows.every((row) => row.length === width)).toBe(true)
        } else {
          expect(result.issues.length).toBeGreaterThan(0)
          expect(result.issues.length).toBeLessThanOrEqual(20)
          expect(result.omitted).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 1000 },
    )
  })

  it('utf8ByteLength agrees with TextEncoder, lone surrogates included', () => {
    const units = fc.array(
      fc.oneof(fc.integer({ min: 0, max: 0xffff }), fc.constantFrom(0xd83d, 0xde00, 0x7f, 0x800)),
      { maxLength: 40 },
    )
    fc.assert(
      fc.property(units, (codes) => {
        const text = String.fromCharCode(...codes)
        expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length)
      }),
      { numRuns: 1000 },
    )
  })
})
