/**
 * The top of a competition page: title, host, status, deadline and the time
 * left before the board closes.
 */
import { Badge } from '@/components/ui'
import type { CompetitionRecord } from '../../contracts/competitions'
import { timeLeft, type Phase } from '../../domain/time'

const PHASE_TEXT: Record<Phase, string> = { open: 'Open', closing: 'Closing', closed: 'Closed' }

interface CompetitionHeaderProps {
  competition: CompetitionRecord
  phase: Phase
  now: number
}

export function CompetitionHeader({ competition, phase, now }: CompetitionHeaderProps) {
  const deadline = new Date(competition.deadline)
  return (
    <header className="border-b border-border pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 data-testid="competition-title" className="text-2xl font-semibold text-foreground">
          {competition.title}
        </h1>
        <Badge
          variant={phase === 'open' ? 'outline' : 'secondary'}
          data-testid="competition-status"
        >
          {PHASE_TEXT[phase]}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Hosted by {competition.hostName}. {phase === 'open' ? 'Closes' : 'Closed'}{' '}
        <time
          dateTime={deadline.toISOString()}
          title={`${deadline.toISOString().slice(0, 16)} UTC`}
        >
          {deadline.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </time>
        {phase === 'open' && (
          <>
            {', in '}
            <span data-testid="countdown" className="font-medium text-primary tabular-nums">
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
