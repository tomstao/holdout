/**
 * The live leaderboard: one row per participant, ranked by their best public
 * score (spec F3). The browser derives it from the public submissions, and
 * the close job will use the same function, so everyone sees the same ranks
 * (docs/decisions/0007-derive-the-leaderboard-from-submissions.md).
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
