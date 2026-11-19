/**
 * The final standings (spec F4): rank on the private rows, the score that
 * decided it, and how far each participant moved from their public rank.
 * The rows are the `final_standings` records the close job wrote; nothing is
 * computed here but the shake-up.
 */
import { TrophyIcon } from 'lucide-react'
import { cn, EmptyState } from '@/components/ui'
import type { CompetitionRecord, FinalStandingRecord } from '../../contracts/competitions'
import { METRIC_INFO } from '../../domain/metrics'
import { formatScore, shakeUp } from '../../domain/ranking'

interface FinalStandingsProps {
  competition: CompetitionRecord
  standings: readonly FinalStandingRecord[]
  viewerId: string | null
}

/** "▲ 3", "▼ 2" or "–": a glyph and a number, never colour alone. */
function ShakeUp({ places }: { places: number }) {
  if (places === 0) {
    return (
      <span className="text-muted-foreground" aria-label="No change">
        –
      </span>
    )
  }
  const up = places > 0
  const count = Math.abs(places)
  return (
    <span
      className={up ? 'text-success' : 'text-destructive'}
      aria-label={`${up ? 'Up' : 'Down'} ${count} ${count === 1 ? 'place' : 'places'}`}
    >
      {up ? '▲' : '▼'} {count}
    </span>
  )
}

export function FinalStandings({ competition, standings, viewerId }: FinalStandingsProps) {
  const metric = METRIC_INFO[competition.metric]
  const rows = [...standings].sort((a, b) => a.rank - b.rank)
  const mine = viewerId ? rows.find((row) => row.participantId === viewerId) : undefined

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<TrophyIcon />}
        title="No final standings."
        description="Nobody submitted before the deadline."
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ranked by {metric.name} on the private rows, which nobody was scored on before the deadline.
        Each participant&apos;s two best public submissions counted.
        {mine && (
          <>
            {' '}
            <span data-testid="my-final-rank" className="text-foreground">
              You finished <span className="font-mono tabular-nums">{mine.rank}</span> of{' '}
              <span className="font-mono tabular-nums">{rows.length}</span>.
            </span>
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table data-testid="final-standings" className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="w-12 py-2 pr-3 text-right font-medium">
                #
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Participant
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Final score
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Public rank
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Shake-up
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isMine = row.participantId === viewerId
              return (
                <tr
                  key={row.participantId}
                  data-testid="final-row"
                  data-participant={row.participantId}
                  aria-current={isMine ? 'true' : undefined}
                  className={cn('border-b border-border', isMine && 'bg-muted')}
                >
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{row.rank}</td>
                  <td className="py-2.5 pr-3 text-foreground">
                    {row.participantName}
                    {isMine && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono tabular-nums"
                    title={String(row.finalScore)}
                  >
                    {formatScore(row.finalScore, competition.scoreDecimals)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                    {row.publicRank}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums">
                    <ShakeUp places={shakeUp(row)} />
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
