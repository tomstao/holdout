import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareScores, METRICS } from './metrics'
import {
  finalStandings,
  formatScore,
  leaderboard,
  shakeUp,
  type PrivatelyScored,
  type ScoredSubmission,
} from './ranking'

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

const scored = (
  participantId: string,
  publicScore: number,
  privateScore: number,
  submittedAt: number,
): PrivatelyScored => ({ ...at(participantId, publicScore, submittedAt), privateScore })

describe('finalStandings', () => {
  it('takes the better private score of the two best public submissions', () => {
    const picked = scored('ann', 0.9, 0.7, 1)
    const alsoPicked = scored('ann', 0.8, 0.85, 2)
    const standings = finalStandings('accuracy', [
      picked,
      alsoPicked,
      // Her best private score, but only her third best public one: it does not count.
      scored('ann', 0.5, 0.99, 3),
    ])
    expect(standings).toEqual([
      {
        rank: 1,
        participantId: 'ann',
        participantName: 'ANN',
        finalScore: 0.85,
        publicRank: 1,
        publicScore: 0.9,
        submissionCount: 3,
        chosen: [
          { submissionId: picked.submissionId, publicScore: 0.9, privateScore: 0.7 },
          { submissionId: alsoPicked.submissionId, publicScore: 0.8, privateScore: 0.85 },
        ],
      },
    ])
  })

  it('ranks by final score, so the public order can turn over', () => {
    const standings = finalStandings('accuracy', [
      scored('ann', 0.95, 0.6, 1),
      scored('bob', 0.9, 0.8, 2),
      scored('cy', 0.7, 0.9, 3),
    ])
    expect(
      standings.map((row) => [row.rank, row.participantId, row.publicRank, shakeUp(row)]),
    ).toEqual([
      [1, 'cy', 3, 2],
      [2, 'bob', 2, 0],
      [3, 'ann', 1, -2],
    ])
  })

  it('ranks lower first for an error metric, in the choice and in the final score', () => {
    const standings = finalStandings('rmse', [
      scored('ann', 1.0, 4.0, 1),
      scored('ann', 2.0, 3.0, 2),
      scored('ann', 9.0, 0.1, 3),
      scored('bob', 1.5, 3.5, 4),
    ])
    expect(standings.map((row) => [row.participantId, row.finalScore])).toEqual([
      ['ann', 3.0],
      ['bob', 3.5],
    ])
  })

  it('chooses the earlier of equal public scores', () => {
    const first = scored('ann', 0.8, 0.5, 1)
    const second = scored('ann', 0.8, 0.6, 2)
    const third = scored('ann', 0.8, 0.9, 3)
    const [ann] = finalStandings('accuracy', [third, second, first])
    expect(ann?.chosen.map((choice) => choice.submissionId)).toEqual([
      first.submissionId,
      second.submissionId,
    ])
    expect(ann?.finalScore).toBe(0.6)
  })

  it('gives a tie on the final score to the earlier deciding submission', () => {
    const tied = finalStandings('accuracy', [
      scored('late', 0.5, 0.7, 20),
      scored('early', 0.4, 0.7, 10),
    ])
    expect(tied.map((row) => row.participantId)).toEqual(['early', 'late'])
  })

  it('takes the one submission of a participant who made one', () => {
    const [only] = finalStandings('mae', [scored('ann', 2, 3, 1)])
    expect(only).toMatchObject({ rank: 1, finalScore: 3, submissionCount: 1 })
    expect(only?.chosen).toHaveLength(1)
  })

  it('is empty without submissions', () => {
    expect(finalStandings('accuracy', [])).toEqual([])
  })
})

describe('shakeUp', () => {
  it('is positive for a climb and negative for a fall', () => {
    expect(shakeUp({ rank: 1, publicRank: 4 })).toBe(3)
    expect(shakeUp({ rank: 5, publicRank: 3 })).toBe(-2)
    expect(shakeUp({ rank: 2, publicRank: 2 })).toBe(0)
  })
})

const privately = fc.array(
  fc.record({
    submissionId: fc.uuid(),
    participantId: fc.constantFrom('a', 'b', 'c', 'd', 'e'),
    participantName: fc.constantFrom('A', 'B'),
    publicScore: fc.constantFrom(0, 0.25, 0.5, 0.75, 1),
    privateScore: fc.constantFrom(0, 0.2, 0.4, 0.6, 0.8, 1),
    submittedAt: fc.integer({ min: 0, max: 20 }),
  }),
  { maxLength: 40 },
)

describe('finalStandings properties', () => {
  it('ranks every participant once, 1 to n, best final score first', () => {
    fc.assert(
      fc.property(fc.constantFrom(...METRICS), privately, (metric, all) => {
        const standings = finalStandings(metric, all)
        const oneToN = standings.map((_, index) => index + 1)
        expect(standings.map((row) => row.rank)).toEqual(oneToN)
        expect(new Set(standings.map((row) => row.participantId)).size).toBe(
          new Set(all.map((s) => s.participantId)).size,
        )
        expect(standings.map((row) => row.publicRank).sort((a, b) => a - b)).toEqual(oneToN)
        for (let index = 1; index < standings.length; index++) {
          const [above, below] = [standings[index - 1], standings[index]]
          if (!above || !below) continue
          expect(compareScores(metric, above.finalScore, below.finalScore)).toBeLessThanOrEqual(0)
        }
      }),
    )
  })

  it('chooses at most two submissions, none worse in public score than one left out', () => {
    fc.assert(
      fc.property(fc.constantFrom(...METRICS), privately, (metric, all) => {
        for (const row of finalStandings(metric, all)) {
          const own = all.filter((s) => s.participantId === row.participantId)
          expect(row.chosen.length).toBe(Math.min(2, own.length))
          const chosenIds = new Set(row.chosen.map((choice) => choice.submissionId))
          const leftOut = own.filter((s) => !chosenIds.has(s.submissionId))
          for (const choice of row.chosen) {
            for (const other of leftOut) {
              expect(
                compareScores(metric, choice.publicScore, other.publicScore),
              ).toBeLessThanOrEqual(0)
            }
            expect(compareScores(metric, row.finalScore, choice.privateScore)).toBeLessThanOrEqual(
              0,
            )
          }
          expect(row.chosen.map((choice) => choice.privateScore)).toContain(row.finalScore)
        }
      }),
    )
  })

  it('does not depend on the order the submissions arrive in', () => {
    fc.assert(
      fc.property(fc.constantFrom(...METRICS), privately, (metric, all) => {
        expect(finalStandings(metric, [...all].reverse())).toEqual(finalStandings(metric, all))
      }),
    )
  })
})
