import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareScores, METRICS } from './metrics'
import { formatScore, leaderboard, type ScoredSubmission } from './ranking'

let counter = 0
const at = (
  participantId: string,
  publicScore: number,
  submittedAt: number,
  participantName = participantId.toUpperCase(),
): ScoredSubmission => ({
  submissionId: `s${String(++counter).padStart(3, '0')}`,
  participantId,
  participantName,
  publicScore,
  submittedAt,
})

describe('leaderboard', () => {
  it('ranks participants by their best score, higher first for accuracy', () => {
    const rows = leaderboard('accuracy', [
      at('ann', 0.7, 1),
      at('bob', 0.9, 2),
      at('ann', 0.95, 3),
      at('cy', 0.5, 4),
    ])
    expect(
      rows.map((row) => [row.rank, row.participantId, row.bestScore, row.submissionCount]),
    ).toEqual([
      [1, 'ann', 0.95, 2],
      [2, 'bob', 0.9, 1],
      [3, 'cy', 0.5, 1],
    ])
  })

  it('ranks lower first for an error metric', () => {
    const rows = leaderboard('rmse', [at('ann', 3.2, 1), at('bob', 1.5, 2), at('ann', 2.1, 3)])
    expect(rows.map((row) => [row.participantId, row.bestScore])).toEqual([
      ['bob', 1.5],
      ['ann', 2.1],
    ])
  })

  it('gives a tie to the participant whose best came first', () => {
    const rows = leaderboard('accuracy', [at('late', 0.8, 50), at('early', 0.8, 10)])
    expect(rows.map((row) => row.participantId)).toEqual(['early', 'late'])
  })

  it('takes the earlier of a participant’s equal bests', () => {
    const first = at('ann', 0.8, 10)
    const rows = leaderboard('accuracy', [at('ann', 0.8, 20), first])
    expect(rows[0]).toMatchObject({ bestSubmissionId: first.submissionId, bestAt: 10 })
  })

  it('shows the name and the time of the latest submission, whichever scored best', () => {
    const latest = at('ann', 0.1, 30, 'Ann B.')
    const rows = leaderboard('accuracy', [at('ann', 0.9, 10, 'Ann'), latest])
    expect(rows[0]).toMatchObject({
      participantName: 'Ann B.',
      bestScore: 0.9,
      bestAt: 10,
      latestSubmissionId: latest.submissionId,
      latestAt: 30,
    })
  })

  it('is empty without submissions', () => {
    expect(leaderboard('mae', [])).toEqual([])
  })
})

describe('formatScore', () => {
  it('rounds to the competition’s decimals', () => {
    expect(formatScore(0.857142857, 4)).toBe('0.8571')
    expect(formatScore(1, 2)).toBe('1.00')
    expect(formatScore(12.3456789, 6)).toBe('12.345679')
  })
})

const submissions = fc.array(
  fc.record({
    submissionId: fc.uuid(),
    participantId: fc.constantFrom('a', 'b', 'c', 'd', 'e'),
    participantName: fc.constantFrom('A', 'B'),
    publicScore: fc.constantFrom(0, 0.25, 0.5, 0.75, 1),
    submittedAt: fc.integer({ min: 0, max: 20 }),
  }),
  { maxLength: 40 },
)

describe('leaderboard properties', () => {
  it('lists each participant once, ranked 1 to n, best first', () => {
    fc.assert(
      fc.property(fc.constantFrom(...METRICS), submissions, (metric, all) => {
        const rows = leaderboard(metric, all)
        expect(rows.map((row) => row.rank)).toEqual(rows.map((_, index) => index + 1))
        expect(new Set(rows.map((row) => row.participantId)).size).toBe(rows.length)
        expect(rows.length).toBe(new Set(all.map((s) => s.participantId)).size)
        for (let index = 1; index < rows.length; index++) {
          const [above, below] = [rows[index - 1], rows[index]]
          if (!above || !below) continue
          expect(compareScores(metric, above.bestScore, below.bestScore)).toBeLessThanOrEqual(0)
        }
      }),
    )
  })

  it('takes each participant’s best score and counts all their submissions', () => {
    fc.assert(
      fc.property(fc.constantFrom(...METRICS), submissions, (metric, all) => {
        for (const row of leaderboard(metric, all)) {
          const own = all.filter((s) => s.participantId === row.participantId)
          expect(row.submissionCount).toBe(own.length)
          for (const submission of own) {
            expect(
              compareScores(metric, row.bestScore, submission.publicScore),
            ).toBeLessThanOrEqual(0)
          }
        }
      }),
    )
  })

  it('does not depend on the order the submissions arrive in', () => {
    fc.assert(
      fc.property(fc.constantFrom(...METRICS), submissions, (metric, all) => {
        expect(leaderboard(metric, [...all].reverse())).toEqual(leaderboard(metric, all))
      }),
    )
  })
})
