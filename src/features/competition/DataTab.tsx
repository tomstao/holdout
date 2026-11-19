/**
 * The competition's files, a look at the expected submission format, and the
 * two columns that matter.
 */
import { useEffect, useState } from 'react'
import { buttonVariants } from '@/components/ui'
import type { CompetitionRecord } from '../../contracts/competitions'
import { fileSize, parseCsv, type CsvTable } from '../../domain/csv'

const DOWNLOADS = [
  { kind: 'train', name: 'train.csv', about: 'Rows to learn from, with the target.' },
  { kind: 'test', name: 'test.csv', about: 'Rows to predict, without the target.' },
  {
    kind: 'sample',
    name: 'sample_submission.csv',
    about: 'A valid submission: every test ID with one guess.',
  },
] as const

const PREVIEW_ROWS = 5

export function fileUrl(competitionId: string, kind: 'train' | 'test' | 'sample'): string {
  return `/api/competitions/${competitionId}/files/${kind}`
}

export function DataTab({
  competitionId,
  competition,
}: {
  competitionId: string
  competition: CompetitionRecord
}) {
  const [preview, setPreview] = useState<CsvTable | 'failed' | undefined>()

  useEffect(() => {
    const controller = new AbortController()
    fetch(fileUrl(competitionId, 'sample'), { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error('not ok'))))
      .then((text) => {
        const table = parseCsv(text, { maxBytes: 5_000_000 })
        setPreview(table.ok ? table.value : 'failed')
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview('failed')
      })
    return () => {
      controller.abort()
    }
  }, [competitionId])

  return (
    <div className="space-y-8 py-4">
      <ul className="divide-y divide-border border-y border-border">
        {DOWNLOADS.map(({ kind, name, about }) => (
          <li key={kind} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-sm text-foreground">{name}</p>
              <p className="text-sm text-muted-foreground">{about}</p>
            </div>
            <a
              href={fileUrl(competitionId, kind)}
              download={name}
              data-testid={`download-${kind}`}
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0' })}
            >
              Download{' '}
              <span className="font-normal text-muted-foreground tabular-nums">
                {fileSize(competition.files[kind].bytes)}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">What to submit</h2>
        <p className="text-sm text-foreground">
          A CSV with exactly two columns, <span className="font-mono">{competition.idColumn}</span>{' '}
          and <span className="font-mono">{competition.targetColumn}</span>, and one row for each of
          the <span className="font-mono tabular-nums">{competition.testRows}</span> test IDs.
          {competition.labels && ` Each prediction is one of: ${competition.labels.join(', ')}.`}
          {!competition.labels && ' Each prediction is a number.'}
        </p>
        {preview === undefined && <div className="h-32 animate-pulse rounded-md bg-muted" />}
        {preview === 'failed' && (
          <p className="text-sm text-muted-foreground">The preview could not be loaded.</p>
        )}
        {preview !== undefined && preview !== 'failed' && (
          <table data-testid="sample-preview" className="border-collapse font-mono text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {preview.header.map((name) => (
                  <th key={name} scope="col" className="py-1.5 pr-6 font-medium">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                <tr key={index} className="border-b border-border">
                  {row.map((cell, column) => (
                    <td key={column} className="py-1.5 pr-6 text-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
