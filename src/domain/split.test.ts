import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { assignSplit, parseUsage, randomSource, SPLITS, USAGE_COLUMN } from './split'

describe('parseUsage', () => {
  it("reads Kaggle's three values", () => {
    expect(parseUsage('Public')).toBe('public')
    expect(parseUsage('Private')).toBe('private')
    expect(parseUsage('Ignored')).toBe('ignored')
  })

  it('ignores case and surrounding spaces', () => {
    expect(parseUsage('PUBLIC')).toBe('public')
    expect(parseUsage(' private ')).toBe('private')
    expect(parseUsage('ignored\t')).toBe('ignored')
  })

  it('refuses anything else', () => {
    for (const value of ['', ' ', 'Pub', 'public,private', 'test', '1', 'constructor']) {
      expect(parseUsage(value)).toBeUndefined()
    }
  })

  it('names the column and the splits', () => {
    expect(USAGE_COLUMN).toBe('Usage')
    expect(SPLITS).toEqual(['public', 'private', 'ignored'])
  })
})

describe('randomSource', () => {
  it('repeats for a seed and differs between seeds', () => {
    const first = randomSource(42)
    const again = randomSource(42)
    const other = randomSource(43)
    const a = Array.from({ length: 5 }, first)
    expect(Array.from({ length: 5 }, again)).toEqual(a)
    expect(Array.from({ length: 5 }, other)).not.toEqual(a)
    for (const value of a) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('treats a seed as an unsigned 32-bit number', () => {
    expect(randomSource(-1)()).toBe(randomSource(0xffffffff)())
  })
})

function count(split: readonly string[], value: string): number {
  return split.filter((entry) => entry === value).length
}

describe('assignSplit', () => {
  it('draws the public share from one class', () => {
    const split = assignSplit(
      Array.from({ length: 100 }, () => ''),
      0.3,
      1,
    )
    expect(count(split, 'public')).toBe(30)
    expect(count(split, 'private')).toBe(70)
  })

  it('draws the public share from every class', () => {
    const strata = [
      ...Array.from({ length: 60 }, () => 'a'),
      ...Array.from({ length: 30 }, () => 'b'),
      ...Array.from({ length: 10 }, () => 'c'),
    ]
    const split = assignSplit(strata, 0.3, 7)
    const publicOf = (label: string) =>
      strata.filter((key, row) => key === label && split[row] === 'public').length
    expect(publicOf('a')).toBe(18)
    expect(publicOf('b')).toBe(9)
    expect(publicOf('c')).toBe(3)
  })

  it('never takes a whole class, and never none of it', () => {
    // 2 rows at a 10% share would round to 0 public; 3 rows at 50% would round to 2.
    expect(count(assignSplit(['a', 'a'], 0.1, 3), 'public')).toBe(1)
    expect(count(assignSplit(['a', 'a'], 0.5, 3), 'public')).toBe(1)
    expect(count(assignSplit(['a', 'a', 'a'], 0.5, 3), 'public')).toBe(2)
  })

  it('keeps a class with one row private', () => {
    const split = assignSplit(['a', 'a', 'a', 'a', 'rare'], 0.5, 11)
    expect(split[4]).toBe('private')
  })

  it('splits without regard to class when every class has one row', () => {
    const split = assignSplit(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], 0.3, 5)
    expect(count(split, 'public')).toBe(3)
    expect(count(split, 'private')).toBe(7)
  })

  it('cannot split fewer than two rows', () => {
    expect(assignSplit([], 0.3, 1)).toEqual([])
    expect(assignSplit(['a'], 0.3, 1)).toEqual(['private'])
  })

  it('gives a different split for a different seed', () => {
    const strata = Array.from({ length: 200 }, (_, row) => (row % 2 === 0 ? 'a' : 'b'))
    expect(assignSplit(strata, 0.3, 1)).not.toEqual(assignSplit(strata, 0.3, 2))
  })
})

const cases = fc.record({
  strata: fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e'), { minLength: 2, maxLength: 80 }),
  publicShare: fc.double({ min: 0.1, max: 0.5, noNaN: true }),
  seed: fc.integer({ min: 0, max: 0xffffffff }),
})

describe('assignSplit properties', () => {
  it('is a partition: every row is public or private, and neither half is empty', () => {
    fc.assert(
      fc.property(cases, ({ strata, publicShare, seed }) => {
        const split = assignSplit(strata, publicShare, seed)
        expect(split).toHaveLength(strata.length)
        expect(count(split, 'public') + count(split, 'private')).toBe(strata.length)
        expect(count(split, 'public')).toBeGreaterThan(0)
        expect(count(split, 'private')).toBeGreaterThan(0)
      }),
    )
  })

  it('is stable for a seed', () => {
    fc.assert(
      fc.property(cases, ({ strata, publicShare, seed }) => {
        expect(assignSplit(strata, publicShare, seed)).toEqual(
          assignSplit(strata, publicShare, seed),
        )
      }),
    )
  })

  it('keeps every class with two or more rows in both halves', () => {
    fc.assert(
      fc.property(cases, ({ strata, publicShare, seed }) => {
        const split = assignSplit(strata, publicShare, seed)
        for (const label of new Set(strata)) {
          const rows = strata.flatMap((key, row) => (key === label ? [split[row]] : []))
          if (rows.length < 2) continue
          expect(rows).toContain('public')
          expect(rows).toContain('private')
        }
      }),
    )
  })

  it('never makes more than about the requested share public', () => {
    fc.assert(
      fc.property(cases, ({ strata, publicShare, seed }) => {
        const split = assignSplit(strata, publicShare, seed)
        // Each class rounds to the nearest row and takes at least one.
        const classes = new Set(strata).size
        expect(count(split, 'public')).toBeLessThanOrEqual(strata.length * publicShare + classes)
      }),
    )
  })
})
