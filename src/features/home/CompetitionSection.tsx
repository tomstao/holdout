/**
 * One section of the competition list on /home (spec F6): a heading and a
 * table with a row per competition: title, summary, host, participants, the
 * top score, and the time left or "Closed".
 *
 * Each row reads its own numbers. A running competition derives them from
 * its public submissions, with the function the leaderboard uses; a closed
 * one reads its final standings. So a row is one subscription, and a section
 * shows `SECTION_ROWS` rows until the viewer asks for the rest.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { formatScore, leaderboard } from '../../domain/ranking'
import { phaseAt, timeLeft, type Phase } from '../../domain/time'
import { useFinalStandings, useSubmissions } from '../competition/hooks'
import type { ListedCompetition } from './hooks'

/** Rows a section shows before "Show all". */
export const SECTION_ROWS = 8

interface SectionProps {
  /** `hosting`, `entered`, `open` or `closed`: the test id and the heading's id. */
  id: string
  title: string
  competitions: readonly ListedCompetition[]
  viewerId: string | null
  now: number
}

export function CompetitionSection({ id, title, competitions, viewerId, now }: SectionProps) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? competitions : competitions.slice(0, SECTION_ROWS)

  return (
    <section aria-labelledby={`${id}-heading`} data-testid={`section-${id}`}>
      <h2
        id={`${id}-heading`}
        className="flex items-baseline gap-2 text-base font-semibold text-foreground"
      >
        {title}
        <span
          aria-label={`${competitions.length} ${competitions.length === 1 ? 'competition' : 'competitions'}`}
          className="font-mono text-sm font-normal text-muted-foreground tabular-nums"
        >
          {competitions.length}
        </span>
      </h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-medium">
              Competition
            </th>
            <th scope="col" className="hidden w-28 py-2 pr-4 text-right font-medium sm:table-cell">
              Participants
            </th>
            <th scope="col" className="hidden w-28 py-2 pr-4 text-right font-medium sm:table-cell">
              Top score
            </th>
            <th scope="col" className="w-32 py-2 text-right font-medium">
              Deadline
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((competition) => {
            const phase = phaseAt(competition.status, competition.deadline, now)
            const Row = phase === 'closed' ? ClosedRow : RunningRow
            return (
              <Row
                key={competition.id}
                competition={competition}
                phase={phase}
                viewerId={viewerId}
                now={now}
              />
            )
          })}
        </tbody>
      </table>
      {shown.length < competitions.length && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => {
            setExpanded(true)
          }}
        >
          Show all {competitions.length}
        </Button>
      )}
    </section>
  )
}

interface RowProps {
  competition: ListedCompetition
  phase: Phase
  viewerId: string | null
  now: number
}

/** A row's numbers. `top` is absent until someone has submitted. */
interface Stats {
  loading: boolean
  participants: number
  top?: number
  /** Which rows the top score was measured on. */
  scoredOn: 'public' | 'final'
}

/** Open or closing: the public leaderboard's size and its leader. */
function RunningRow(props: RowProps) {
  const { id, metric } = props.competition
  const { submissions, loading } = useSubmissions(id)
  const board = useMemo(() => leaderboard(metric, submissions), [metric, submissions])
  return (
    <RowView
      {...props}
      stats={{
        loading,
        participants: board.length,
        top: board.at(0)?.bestScore,
        scoredOn: 'public',
      }}
    />
  )
}

/** Closed: the final standings' size and the winner's final score. */
function ClosedRow(props: RowProps) {
  const { standings, loading } = useFinalStandings(props.competition.id)
  const winner = standings.find((standing) => standing.rank === 1)
  return (
    <RowView
      {...props}
      stats={{
        loading,
        participants: standings.length,
        top: winner?.finalScore,
        scoredOn: 'final',
      }}
    />
  )
}

const placeholder = <span className="inline-block h-4 w-10 animate-pulse rounded-sm bg-muted" />

function RowView({ competition, phase, viewerId, now, stats }: RowProps & { stats: Stats }) {
  const score =
    stats.top === undefined ? undefined : formatScore(stats.top, competition.scoreDecimals)

  return (
    <tr
      data-testid="competition-row"
      data-competition={competition.id}
      className="border-b border-border align-top"
    >
      <td className="py-3 pr-4">
        <Link
          to={`/c/${competition.id}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {competition.title}
        </Link>
        <p className="mt-0.5 line-clamp-2 text-muted-foreground">{competition.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Hosted by {competition.hostId === viewerId ? 'you' : competition.hostName}
          {/* On a phone the two number columns are hidden; their values go here. */}
          {!stats.loading && (
            <span className="sm:hidden">
              {' · '}
              {stats.participants} {stats.participants === 1 ? 'participant' : 'participants'}
              {score !== undefined && (
                <>
                  {' · top '}
                  <span className="font-mono tabular-nums">{score}</span> ({stats.scoredOn})
                </>
              )}
            </span>
          )}
        </p>
      </td>
      <td
        data-testid="row-participants"
        className="hidden py-3 pr-4 text-right font-mono tabular-nums sm:table-cell"
      >
        {stats.loading ? placeholder : stats.participants}
      </td>
      <td data-testid="row-top-score" className="hidden py-3 pr-4 text-right sm:table-cell">
        {stats.loading ? (
          placeholder
        ) : score === undefined ? (
          <span className="text-muted-foreground" aria-label="No submissions yet">
            –
          </span>
        ) : (
          <>
            <span className="font-mono tabular-nums" title={String(stats.top)}>
              {score}
            </span>
            <span className="block text-xs text-muted-foreground">{stats.scoredOn}</span>
          </>
        )}
      </td>
      <td data-testid="row-deadline" className="py-3 text-right whitespace-nowrap">
        <Deadline competition={competition} phase={phase} now={now} />
      </td>
    </tr>
  )
}

const day = (time: number) =>
  new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function Deadline({ competition, phase, now }: Omit<RowProps, 'viewerId'>) {
  const deadline = new Date(competition.deadline)
  if (phase === 'open') {
    return (
      <>
        <span className="font-medium text-primary tabular-nums">
          {timeLeft(competition.deadline - now, 'minute')}
        </span>{' '}
        <span className="text-muted-foreground">left</span>
        <time
          dateTime={deadline.toISOString()}
          title={`${deadline.toISOString().slice(0, 16)} UTC`}
          className="block text-xs text-muted-foreground"
        >
          {deadline.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </time>
      </>
    )
  }
  if (phase === 'closing') {
    return (
      <>
        <span className="text-foreground">Closing</span>
        <span className="block text-xs text-muted-foreground">Final standings soon</span>
      </>
    )
  }
  const closed = competition.closedAt ?? competition.deadline
  return (
    <>
      <span className="text-muted-foreground">Closed</span>
      <time
        dateTime={new Date(closed).toISOString()}
        className="block text-xs text-muted-foreground"
      >
        {day(closed)}
      </time>
    </>
  )
}
