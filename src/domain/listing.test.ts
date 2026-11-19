import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arrange, RECENTLY_CLOSED, type Listed } from './listing'

const competition = (id: string, change: Partial<Listed> = {}): Listed => ({
  id,
  hostId: 'ada',
  status: 'open',
  deadline: 1_000,
  ...change,
})

const ids = (list: readonly Listed[]) => list.map((entry) => entry.id)
const nobody = { id: null, entered: new Set<string>() }

describe('arrange', () => {
  it('puts each competition in one section for a signed-in viewer', () => {
    const sections = arrange(
      [
        competition('mine', { hostId: 'me' }),
        competition('mine-closed', { hostId: 'me', status: 'closed' }),
        competition('joined'),
        competition('joined-closed', { status: 'closed' }),
        competition('other'),
        competition('closing', { status: 'closing' }),
        competition('other-closed', { status: 'closed' }),
      ],
      { id: 'me', entered: new Set(['joined', 'joined-closed']) },
    )
    expect(ids(sections.hosting)).toEqual(['mine', 'mine-closed'])
    expect(ids(sections.entered)).toEqual(['joined', 'joined-closed'])
    expect(ids(sections.open)).toEqual(['closing', 'other'])
    expect(ids(sections.closed)).toEqual(['other-closed'])
  })

  it('shows a visitor open and closed competitions only', () => {
    const sections = arrange(
      [competition('a'), competition('b', { status: 'closed' }), competition('c')],
      nobody,
    )
    expect(sections.hosting).toEqual([])
    expect(sections.entered).toEqual([])
    expect(ids(sections.open)).toEqual(['a', 'c'])
    expect(ids(sections.closed)).toEqual(['b'])
  })

  it('files a competition the viewer hosts under hosting, even if they are listed as entered', () => {
    const sections = arrange([competition('x', { hostId: 'me' })], {
      id: 'me',
      entered: new Set(['x']),
    })
    expect(ids(sections.hosting)).toEqual(['x'])
    expect(sections.entered).toEqual([])
  })

  it('lists the competition that ends soonest first', () => {
    const sections = arrange(
      [
        competition('late', { deadline: 3_000 }),
        competition('soon', { deadline: 1_000 }),
        competition('middle', { deadline: 2_000 }),
      ],
      nobody,
    )
    expect(ids(sections.open)).toEqual(['soon', 'middle', 'late'])
  })

  it('lists closed competitions latest first, by when they closed', () => {
    const sections = arrange(
      [
        competition('old', { status: 'closed', deadline: 1_000, closedAt: 1_060 }),
        competition('new', { status: 'closed', deadline: 3_000, closedAt: 3_060 }),
        // Closed late: its deadline is the earliest, its close the latest.
        competition('stuck', { status: 'closed', deadline: 500, closedAt: 9_000 }),
        competition('no-time', { status: 'closed', deadline: 2_000 }),
      ],
      nobody,
    )
    expect(ids(sections.closed)).toEqual(['stuck', 'new', 'no-time', 'old'])
  })

  it('keeps running competitions above closed ones in the viewer’s own sections', () => {
    const sections = arrange(
      [
        competition('closed-recently', { hostId: 'me', status: 'closed', closedAt: 9_000 }),
        competition('running-late', { hostId: 'me', deadline: 8_000 }),
        competition('running-soon', { hostId: 'me', deadline: 7_000 }),
        competition('closed-long-ago', { hostId: 'me', status: 'closed', closedAt: 100 }),
      ],
      { id: 'me', entered: new Set() },
    )
    expect(ids(sections.hosting)).toEqual([
      'running-soon',
      'running-late',
      'closed-recently',
      'closed-long-ago',
    ])
  })

  it('shows only the latest few closed competitions, and all of the viewer’s own', () => {
    const closed = Array.from({ length: RECENTLY_CLOSED + 3 }, (_, index) =>
      competition(`c${index}`, { status: 'closed', closedAt: index }),
    )
    expect(ids(arrange(closed, nobody).closed)).toEqual(['c7', 'c6', 'c5', 'c4', 'c3'])
    expect(arrange(closed, nobody, 2).closed).toHaveLength(2)
    expect(arrange(closed, { id: 'ada', entered: new Set() }).hosting).toHaveLength(closed.length)
  })

  it('breaks a tie by id, so the order is stable', () => {
    const tied = [competition('b'), competition('c'), competition('a')]
    expect(ids(arrange(tied, nobody).open)).toEqual(['a', 'b', 'c'])
    expect(ids(arrange([...tied].reverse(), nobody).open)).toEqual(['a', 'b', 'c'])
  })

  it('does not change the list it is given', () => {
    const list = [competition('b', { deadline: 2 }), competition('a', { deadline: 1 })]
    arrange(list, nobody)
    expect(ids(list)).toEqual(['b', 'a'])
  })

  const listed = fc.record({
    id: fc.string({ minLength: 1, maxLength: 3 }),
    hostId: fc.constantFrom('me', 'ada', 'bob'),
    status: fc.constantFrom('open' as const, 'closing' as const, 'closed' as const),
    deadline: fc.integer({ min: 0, max: 50 }),
    closedAt: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
  })
  const lists = fc.uniqueArray(listed, { selector: (entry) => entry.id, maxLength: 12 })

  it('never lists a competition twice, and loses none but old closed ones', () => {
    fc.assert(
      fc.property(lists, fc.boolean(), (competitions, signedIn) => {
        const entered = new Set(competitions.filter((_, index) => index % 3 === 0).map((c) => c.id))
        const viewer = signedIn ? { id: 'me', entered } : nobody
        const sections = arrange(competitions, viewer, 1000)
        const shown = [
          ...sections.hosting,
          ...sections.entered,
          ...sections.open,
          ...sections.closed,
        ]
        expect(ids(shown).sort()).toEqual(ids(competitions).sort())
        expect(sections.open.every((entry) => entry.status !== 'closed')).toBe(true)
        expect(sections.closed.every((entry) => entry.status === 'closed')).toBe(true)
        if (!signedIn) expect(sections.hosting).toEqual([])
      }),
    )
  })

  it('gives the same sections whatever order the competitions arrive in', () => {
    fc.assert(
      fc.property(lists, (competitions) => {
        const viewer = { id: 'me', entered: new Set<string>() }
        expect(arrange([...competitions].reverse(), viewer)).toEqual(arrange(competitions, viewer))
      }),
    )
  })
})
