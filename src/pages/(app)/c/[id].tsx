/**
 * /c/:id: a competition, for anyone.
 *
 * For now it shows what exists so far: the header and the data to download.
 * The leaderboard, the submit form and the tabs arrive with docs/plan.md, PR 9.
 */
import { Link, useParams } from 'react-router-dom'
import { Badge, buttonVariants } from '@/components/ui'
import { useCollection } from '../../../client/records'
import { APP_NAME } from '../../../constants'
import { fileSize } from '../../../domain/csv'
import { METRIC_INFO } from '../../../domain/metrics'

const DOWNLOADS = [
  { kind: 'train', name: 'train.csv' },
  { kind: 'test', name: 'test.csv' },
  { kind: 'sample', name: 'sample_submission.csv' },
] as const

export default function CompetitionPage() {
  const { id = '' } = useParams()
  const { records, status } = useCollection('competitions')
  const competition = records.find((record) => record.recordId === id)?.data

  if (!competition) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <title>{`Competition · ${APP_NAME}`}</title>
        {status === 'loading' ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Loading the competition.
          </p>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground">
              This competition does not exist.
            </h1>
            <Link to="/home" className={buttonVariants({ variant: 'outline', className: 'mt-6' })}>
              All competitions
            </Link>
          </>
        )}
      </div>
    )
  }

  const metric = METRIC_INFO[competition.metric]
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <title>{`${competition.title} · ${APP_NAME}`}</title>
      <header className="border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 data-testid="competition-title" className="text-2xl font-semibold text-foreground">
            {competition.title}
          </h1>
          <Badge variant={competition.status === 'open' ? 'default' : 'secondary'}>
            {competition.status === 'open' ? 'Open' : 'Closed'}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Hosted by {competition.hostName}. Closes{' '}
          <time dateTime={new Date(competition.deadline).toISOString()}>
            {new Date(competition.deadline).toLocaleString()}
          </time>
          .
        </p>
        <p className="mt-4 text-foreground">{competition.summary}</p>
      </header>

      {competition.description !== '' && (
        <p className="mt-6 text-sm whitespace-pre-line text-foreground">
          {competition.description}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold text-foreground">Rules</h2>
        <p className="mt-2 text-sm text-foreground">
          Scored by {metric.name} ({metric.higherIsBetter ? 'higher' : 'lower'} is better) on{' '}
          <span className="font-mono tabular-nums">{competition.testRows}</span> test rows. Up to{' '}
          <span className="font-mono tabular-nums">{competition.dailyLimit}</span> submissions per
          day.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-foreground">Data</h2>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {DOWNLOADS.map(({ kind, name }) => (
            <li key={kind} className="flex items-center justify-between gap-4 py-3">
              <span className="font-mono text-sm text-foreground">{name}</span>
              <a
                href={`/api/competitions/${id}/files/${kind}`}
                download={name}
                data-testid={`download-${kind}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Download{' '}
                <span className="font-mono tabular-nums">
                  {fileSize(competition.files[kind].bytes)}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          The ID column is <span className="font-mono">{competition.idColumn}</span>; predict{' '}
          <span className="font-mono">{competition.targetColumn}</span>.
        </p>
      </section>
    </div>
  )
}
