/**
 * The top of a competition page: title, host, status, deadline and the time
 * left before the board closes.
 */
import { Badge } from '@/components/ui'
import type { CompetitionRecord } from '../../contracts/competitions'
import { acceptsSubmissions, timeLeft } from '../../domain/time'
import { useNow } from './hooks'

const STATUS_TEXT = { open: 'Open', closing: 'Closing', closed: 'Closed' } as const

export function CompetitionHeader({ competition }: { competition: CompetitionRecord }) {
  const now = useNow()
  const deadline = new Date(competition.deadline)
  const open = competition.status === 'open' && acceptsSubmissions(competition.deadline, now)

  return (
    <header className="border-b border-border pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 data-testid="competition-title" className="text-2xl font-semibold text-foreground">
          {competition.title}
        </h1>
        <Badge variant={open ? 'default' : 'secondary'} data-testid="competition-status">
          {open
            ? 'Open'
            : competition.status === 'open'
              ? 'Closing'
              : STATUS_TEXT[competition.status]}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Hosted by {competition.hostName}. {open ? 'Closes' : 'Closed'}{' '}
        <time
          dateTime={deadline.toISOString()}
          title={`${deadline.toISOString().slice(0, 16)} UTC`}
        >
          {deadline.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </time>
        {open && (
          <>
            {', in '}
            <span data-testid="countdown" className="font-mono text-foreground tabular-nums">
              {timeLeft(competition.deadline - now)}
            </span>
          </>
        )}
        .
      </p>
      <p className="mt-4 text-foreground">{competition.summary}</p>
    </header>
  )
}
