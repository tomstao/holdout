import { describe, expect, it } from 'vitest'
import { MAX_MAGNITUDE, shown, shownList, tooLarge } from './text'

describe('shown', () => {
  it('quotes a value and cuts a long one', () => {
    expect(shown('species')).toBe('"species"')
    expect(shown('')).toBe('""')
    expect(shown('x'.repeat(40))).toBe(`"${'x'.repeat(40)}"`)
    expect(shown('x'.repeat(41))).toBe(`"${'x'.repeat(40)}…"`)
  })
})

describe('shownList', () => {
  it('lists every value when there are few', () => {
    expect(shownList([])).toBe('')
    expect(shownList(['id', 'species'])).toBe('"id", "species"')
    expect(shownList(Array.from({ length: 12 }, (_, index) => `c${index}`))).not.toContain('…')
  })

  it('stops after the first twelve, however many there are', () => {
    const many = Array.from({ length: 2_000_000 }, () => '')
    const listed = shownList(many)
    expect(listed).toBe(`${Array.from({ length: 12 }, () => '""').join(', ')}, …`)
    expect(shownList(['a', 'b', 'c'], 2)).toBe('"a", "b", …')
  })
})

describe('the magnitude limit', () => {
  it('keeps a squared error, and 50,000 of them, finite', () => {
    const worst = (MAX_MAGNITUDE - -MAX_MAGNITUDE) ** 2
    expect(Number.isFinite(worst)).toBe(true)
    expect(Number.isFinite(worst * 50_000)).toBe(true)
    // What it guards against.
    expect(Number.isFinite((1e200 - 1) ** 2)).toBe(false)
  })

  it('says what to do about a number beyond it', () => {
    expect(tooLarge('1e200')).toBe(
      '"1e200" is too large to score. Use a number between -1e100 and 1e100.',
    )
  })
})
