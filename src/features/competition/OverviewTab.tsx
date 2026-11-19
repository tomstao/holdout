/**
 * What the competition asks for and how it is scored.
 */
import type { CompetitionRecord } from '../../contracts/competitions'
import { METRIC_INFO } from '../../domain/metrics'

const METRIC_SENTENCE = {
  accuracy: 'the share of rows you predict exactly right',
  macro_f1: 'the F1 score of each label, averaged with every label counting the same',
  rmse: 'the root mean squared error of your predictions',
  mae: 'the mean absolute error of your predictions',
} as const

export function OverviewTab({ competition }: { competition: CompetitionRecord }) {
  const metric = METRIC_INFO[competition.metric]
  const publicShare = Math.round((competition.publicRows / competition.testRows) * 100)
  return (
    <div className="space-y-6 py-4 text-sm text-foreground">
      {competition.description !== '' && (
        <p data-testid="description" className="whitespace-pre-line">
          {competition.description}
        </p>
      )}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Scoring</h2>
        <p>
          {metric.name}: {METRIC_SENTENCE[competition.metric]}.{' '}
          {metric.higherIsBetter ? 'Higher is better.' : 'Lower is better.'}
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Rules</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Up to <span className="font-mono tabular-nums">{competition.dailyLimit}</span>{' '}
            submissions per day. The count resets at 00:00 UTC.
          </li>
          <li>
            The public leaderboard scores{' '}
            <span className="font-mono tabular-nums">{publicShare}%</span> of the{' '}
            <span className="font-mono tabular-nums">{competition.testRows}</span> test rows. Which
            rows those are stays hidden.
          </li>
          <li>
            At the close, your two best public submissions are scored on the other rows. The better
            of the two decides your final rank.
          </li>
          <li>A file with problems is not scored and does not count against your limit.</li>
          <li>The host cannot submit to their own competition.</li>
        </ul>
      </section>
    </div>
  )
}
