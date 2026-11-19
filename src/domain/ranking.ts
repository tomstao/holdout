/**
 * Rankings.
 *
 * `leaderboard` is the live one: a row per participant, ranked by their best
 * public score (spec F3). The browser derives it from the public submissions
 * (docs/decisions/0007-derive-the-leaderboard-from-submissions.md).
 *
 * `finalStandings` is the one the close job computes once, from the private
 * scores (spec F4). It uses `leaderboard` for each participant's public rank,
 * so the shake-up compares like with like.
 */
import { compareScores, type Metric } from './metrics'

/** A scored submission, as the leaderboard needs it. */
export interface ScoredSubmission {
  submissionId: string
  participantId: string
  participantName: string
  publicScore: number
  /** When the room stored it, epoch milliseconds. */
  submittedAt: number
}

export interface LeaderboardRow {
  /** 1 for the best participant; no two rows share a rank. */
  rank: number
  participantId: string
  /** The name on their latest submission. */
  participantName: string
  bestScore: number
  bestSubmissionId: string
  bestAt: number
  submissionCount: number
  /** Their latest submission, whichever scored best. */
  latestSubmissionId: string
  latestAt: number
}

/** Earlier first; equal times by id, so the order never depends on input order. */
function earlier(a: ScoredSubmission, b: ScoredSubmission): number {
  return a.submittedAt - b.submittedAt || (a.submissionId < b.submissionId ? -1 : 1)
}

/**
 * Rank participants by their best public score. A participant's best is
 * their best score, the earlier submission winning a tie; between
 * participants a tie goes to the one whose best came first, as on Kaggle.
 */
export function leaderboard(
  metric: Metric,
  submissions: readonly ScoredSubmission[],
): LeaderboardRow[] {
  const byParticipant = new Map<string, ScoredSubmission[]>()
  for (const submission of submissions) {
    const own = byParticipant.get(submission.participantId)
    if (own) own.push(submission)
    else byParticipant.set(submission.participantId, [submission])
  }

  const rows: Omit<LeaderboardRow, 'rank'>[] = []
  for (const [participantId, own] of byParticipant) {
    const chronological = [...own].sort(earlier)
    const best = chronological.reduce((winner, candidate) =>
      compareScores(metric, candidate.publicScore, winner.publicScore) < 0 ? candidate : winner,
    )
    const latest = chronological[chronological.length - 1] ?? best
    rows.push({
      participantId,
      participantName: latest.participantName,
      bestScore: best.publicScore,
      bestSubmissionId: best.submissionId,
      bestAt: best.submittedAt,
      submissionCount: own.length,
      latestSubmissionId: latest.submissionId,
      latestAt: latest.submittedAt,
    })
  }

  rows.sort(
    (a, b) =>
      compareScores(metric, a.bestScore, b.bestScore) ||
      a.bestAt - b.bestAt ||
      (a.participantId < b.participantId ? -1 : 1),
  )
  return rows.map((row, index) => ({ rank: index + 1, ...row }))
}

/** A score as the competition shows it: rounded to its decimals. */
export function formatScore(score: number, decimals: number): string {
  return score.toFixed(decimals)
}

/** A submission with its score on the private rows, which only the server holds. */
export interface PrivatelyScored extends ScoredSubmission {
  privateScore: number
}

/** A submission that counted towards a participant's final score. */
export interface ChosenSubmission {
  submissionId: string
  publicScore: number
  privateScore: number
}

export interface FinalStanding {
  /** 1 for the winner; no two rows share a rank. */
  rank: number
  participantId: string
  participantName: string
  /** The better private score of the chosen submissions. */
  finalScore: number
  /** Their rank on the public leaderboard at the deadline. */
  publicRank: number
  /** Their best public score. */
  publicScore: number
  submissionCount: number
  chosen: ChosenSubmission[]
}

/** How many of a participant's submissions are scored for the final standings. */
export const FINAL_PICKS = 2

/**
 * The final standings (spec F4). For each participant the two best public
 * submissions are chosen, the earlier winning a tie; their final score is the
 * better private score of those; ranks go by final score, a tie to the
 * participant whose deciding submission came first.
 */
export function finalStandings(
  metric: Metric,
  submissions: readonly PrivatelyScored[],
): FinalStanding[] {
  const own = new Map<string, PrivatelyScored[]>()
  for (const submission of submissions) {
    const list = own.get(submission.participantId)
    if (list) list.push(submission)
    else own.set(submission.participantId, [submission])
  }

  const rows = leaderboard(metric, submissions).flatMap((row) => {
    const chosen = [...(own.get(row.participantId) ?? [])]
      .sort((a, b) => compareScores(metric, a.publicScore, b.publicScore) || earlier(a, b))
      .slice(0, FINAL_PICKS)
    const decider = [...chosen].sort(
      (a, b) => compareScores(metric, a.privateScore, b.privateScore) || earlier(a, b),
    )[0]
    if (!decider) return []
    return [
      {
        participantId: row.participantId,
        participantName: row.participantName,
        finalScore: decider.privateScore,
        decidedAt: decider.submittedAt,
        publicRank: row.rank,
        publicScore: row.bestScore,
        submissionCount: row.submissionCount,
        chosen: chosen.map(({ submissionId, publicScore, privateScore }) => ({
          submissionId,
          publicScore,
          privateScore,
        })),
      },
    ]
  })

  rows.sort(
    (a, b) =>
      compareScores(metric, a.finalScore, b.finalScore) ||
      a.decidedAt - b.decidedAt ||
      (a.participantId < b.participantId ? -1 : 1),
  )
  return rows.map(({ decidedAt: _decidedAt, ...row }, index) => ({ rank: index + 1, ...row }))
}

/**
 * How a participant moved from the public leaderboard to the final standings:
 * positive when they climbed. Shown as "▲ 3", "▼ 2" or "–".
 */
export function shakeUp(standing: Pick<FinalStanding, 'rank' | 'publicRank'>): number {
  return standing.publicRank - standing.rank
}
