/**
 * The Leaderboard tab.
 *
 * While the competition is open it is the live public leaderboard (spec F3):
 * one row per participant, ranked by their best public score, derived in the
 * browser from the public submissions with the function every viewer runs.
 *
 * After the deadline it says the final standings are being computed, and once
 * they are written it shows them (spec F4), with a switch back to the public
 * leaderboard as it stood.
 */
import { useMemo, useState } from 'react'
import { TrophyIcon } from 'lucide-react'
import { Button, cn, EmptyState } from '@/components/ui'
import type { CompetitionRecord, FinalStandingRecord } from '../../contracts/competitions'
import { METRIC_INFO } from '../../domain/metrics'
import { formatScore, leaderboard } from '../../domain/ranking'
import type { Phase } from '../../domain/time'
import { FinalStandings } from './FinalStandings'
import type { Submission } from './hooks'

interface LeaderboardTabProps {
  competition: CompetitionRecord
  phase: Phase
  submissions: readonly Submission[]
  standings: readonly FinalStandingRecord[]
  loading: boolean
  /** The signed-in viewer, if any. */
  viewerId: string | null
  /** Opens the Submit tab, for the empty state's action; absent for the host. */
  onSubmitClick?: () => void
}

function when(time: number): string {
  return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function LeaderboardTab({
  competition,
  phase,
  submissions,
  standings,
  loading,
  viewerId,
  onSubmitClick,
}: LeaderboardTabProps) {
  const [view, setView] = useState<'final' | 'public'>('final')

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-2 py-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  if (phase === 'closed') {
    return (
      <div className="space-y-4 py-4">
        <div className="flex gap-2" role="group" aria-label="Which leaderboard to show">
          {(['final', 'public'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={view === option ? 'default' : 'outline'}
              aria-pressed={view === option}
              onClick={() => {
                setView(option)
              }}
            >
              {option === 'final' ? 'Final standings' : 'Public leaderboard'}
            </Button>
          ))}
        </div>
        {view === 'final' ? (
          <FinalStandings competition={competition} standings={standings} viewerId={viewerId} />
        ) : (
          <PublicBoard
            competition={competition}
            submissions={submissions}
            viewerId={viewerId}
            intro="The public leaderboard as it stood at the deadline."
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4">
      {phase === 'closing' && (
        <p
          data-testid="closing-notice"
          role="status"
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground"
        >
          Deadline passed. Final standings are being computed. This page updates on its own.
        </p>
      )}
      <PublicBoard
        competition={competition}
        submissions={submissions}
        viewerId={viewerId}
        onSubmitClick={phase === 'open' ? onSubmitClick : undefined}
      />
    </div>
  )
}

interface PublicBoardProps {
  competition: CompetitionRecord
  submissions: readonly Submission[]
  viewerId: string | null
  /** Replaces the sentence above the table. */
  intro?: string
  onSubmitClick?: () => void
}

function PublicBoard({
  competition,
  submissions,
  viewerId,
  intro,
  onSubmitClick,
}: PublicBoardProps) {
  const rows = useMemo(
    () => leaderboard(competition.metric, submissions),
    [competition.metric, submissions],
  )
  // Rows whose latest submission arrives after the page opened flash once
  // (`row-flash` in styles.css, off under prefers-reduced-motion).
  const [openedAt] = useState(() => Date.now())
  const metric = METRIC_INFO[competition.metric]
  const mine = viewerId ? rows.find((row) => row.participantId === viewerId) : undefined

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<TrophyIcon />}
        title="No submissions yet."
        description={onSubmitClick ? 'The first one sets the bar.' : 'Nobody submitted.'}
        action={onSubmitClick ? { label: 'Submit predictions', onClick: onSubmitClick } : undefined}
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {intro ?? (
          <>
            Ranked by {metric.name} on the public rows ({metric.higherIsBetter ? 'higher' : 'lower'}{' '}
            is better). The private rows decide the final standings at the close.
          </>
        )}
        {mine && (
          <>
            {' '}
            <span data-testid="my-rank" className="text-foreground">
              You {intro ? 'were' : 'are'}{' '}
              <span className="font-mono tabular-nums">{mine.rank}</span> of{' '}
              <span className="font-mono tabular-nums">{rows.length}</span>.
            </span>
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table data-testid="leaderboard" className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="w-12 py-2 pr-3 text-right font-medium">
                #
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Participant
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Best score
              </th>
              <th scope="col" className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
                Entries
              </th>
              <th scope="col" className="hidden py-2 font-medium md:table-cell">
                Best at
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isMine = row.participantId === viewerId
              return (
                <tr
                  // A new latest submission remounts the row, which plays the flash once.
                  key={`${row.participantId}:${row.latestSubmissionId}`}
                  data-testid="leaderboard-row"
                  data-participant={row.participantId}
                  aria-current={isMine ? 'true' : undefined}
                  className={cn(
                    'border-b border-border',
                    isMine && 'bg-muted',
                    row.latestAt > openedAt && 'row-flash',
                  )}
                >
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{row.rank}</td>
                  <td className="py-2.5 pr-3 text-foreground">
                    {row.participantName}
                    {isMine && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono tabular-nums"
                    title={String(row.bestScore)}
                  >
                    {formatScore(row.bestScore, competition.scoreDecimals)}
                  </td>
                  <td className="hidden py-2.5 pr-3 text-right font-mono tabular-nums sm:table-cell">
                    {row.submissionCount}
                  </td>
                  <td className="hidden py-2.5 text-muted-foreground md:table-cell">
                    {when(row.bestAt)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
