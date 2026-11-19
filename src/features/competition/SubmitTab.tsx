/**
 * Submit predictions (spec F2): choose a CSV, see the local check, submit, and
 * see your own submissions. The file is checked in the browser with what the
 * competition publishes; the server checks it against the answer key.
 */
import { useMemo, useState } from 'react'
import { AuthOverlay } from 'deepspace'
import { Button, useToast } from '@/components/ui'
import { callAction } from '../../client/actions'
import { FileDrop } from '../../components/FileDrop'
import type { CompetitionRecord } from '../../contracts/competitions'
import { fileIssues } from '../../contracts/file-issues'
import type { Issue } from '../../contracts/result'
import { megabytes } from '../../domain/csv'
import { compareScores } from '../../domain/metrics'
import { checkPredictionsFile, PREDICTIONS_LIMITS } from '../../domain/predictions'
import { formatScore } from '../../domain/ranking'
import { acceptsSubmissions, nextUtcMidnight, timeLeft, utcDay } from '../../domain/time'
import { useNow, type Submission } from './hooks'

interface SubmitTabProps {
  competitionId: string
  competition: CompetitionRecord
  submissions: readonly Submission[]
  viewerId: string | null
}

interface Picked {
  name: string
  text?: string
  issues: Issue[]
  summary?: string
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export function SubmitTab({ competitionId, competition, submissions, viewerId }: SubmitTabProps) {
  const toast = useToast()
  const now = useNow()
  const [picked, setPicked] = useState<Picked | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)

  const mine = useMemo(
    () =>
      submissions
        .filter((submission) => submission.participantId === viewerId)
        .sort((a, b) => b.submittedAt - a.submittedAt),
    [submissions, viewerId],
  )
  const best = mine.reduce<Submission | undefined>(
    (winner, candidate) =>
      !winner || compareScores(competition.metric, candidate.publicScore, winner.publicScore) < 0
        ? candidate
        : winner,
    undefined,
  )

  if (!viewerId) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-foreground">Sign in to submit predictions.</p>
        <Button
          className="mt-4"
          onClick={() => {
            setShowSignIn(true)
          }}
        >
          Sign in
        </Button>
        {showSignIn && (
          <AuthOverlay
            onClose={() => {
              setShowSignIn(false)
            }}
          />
        )}
      </div>
    )
  }
  if (viewerId === competition.hostId) {
    return (
      <p className="py-10 text-center text-sm text-foreground">
        You host this competition, so you cannot submit to it.
      </p>
    )
  }

  const open = competition.status === 'open' && acceptsSubmissions(competition.deadline, now)
  const today = utcDay(now)
  const usedToday = mine.filter((submission) => submission.utcDay === today).length
  const left = competition.dailyLimit - usedToday
  const resetsIn = timeLeft(nextUtcMidnight(now) - now)

  const pick = async (file: File) => {
    if (file.size > 2 * PREDICTIONS_LIMITS.maxBytes) {
      setPicked({
        name: file.name,
        issues: [
          {
            path: [],
            message: `The file is ${megabytes(file.size)}; the limit is ${megabytes(PREDICTIONS_LIMITS.maxBytes)}.`,
          },
        ],
      })
      return
    }
    const text = await file.text()
    const checked = checkPredictionsFile(text, {
      idColumn: competition.idColumn,
      targetColumn: competition.targetColumn,
      taskType: competition.taskType,
      labels: competition.labels,
      testRows: competition.testRows,
    })
    setPicked(
      checked.ok
        ? { name: file.name, text, issues: [], summary: plural(checked.value.ids.length, 'row') }
        : { name: file.name, issues: fileIssues(checked) },
    )
  }

  const submit = async () => {
    if (!picked?.text) return
    setSubmitting(true)
    try {
      const result = await callAction('submitPredictions', {
        competitionId,
        fileName: picked.name,
        csv: picked.text,
      })
      if (result.success) {
        const { publicScore, slot, dailyLimit } = result.data
        toast.success(
          `Scored ${formatScore(publicScore, competition.scoreDecimals)}.`,
          `Submission ${slot} of ${dailyLimit} today.`,
        )
        setPicked(undefined)
        return
      }
      if (result.code === 'invalid_file') {
        setPicked({ name: picked.name, issues: result.issues ?? [] })
      }
      toast.error(result.error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 py-4">
      {!open ? (
        <p data-testid="submit-closed" className="text-sm text-foreground">
          This competition has closed. It no longer accepts submissions.
        </p>
      ) : (
        <section className="space-y-4">
          <p data-testid="submit-usage" className="text-sm text-foreground">
            {left > 0 ? (
              <>
                <span className="font-mono tabular-nums">{usedToday}</span> of{' '}
                <span className="font-mono tabular-nums">{competition.dailyLimit}</span> submissions
                used today. The count resets in{' '}
                <span className="font-mono tabular-nums">{resetsIn}</span>.
              </>
            ) : (
              <>
                You have used all{' '}
                <span className="font-mono tabular-nums">{competition.dailyLimit}</span> submissions
                today. The count resets in{' '}
                <span className="font-mono tabular-nums">{resetsIn}</span>.
              </>
            )}
          </p>
          <FileDrop
            testId="file-predictions"
            label="predictions.csv"
            hint={`Columns ${competition.idColumn} and ${competition.targetColumn}, one row per test ID. At most 2 MB.`}
            fileName={picked?.name}
            summary={picked?.summary}
            issues={picked?.issues ?? []}
            disabled={submitting || left <= 0}
            onPick={(file) => void pick(file)}
          />
          <Button
            data-testid="submit-predictions"
            loading={submitting}
            disabled={!picked?.text || left <= 0}
            onClick={() => void submit()}
          >
            Submit
          </Button>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Your submissions</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <table data-testid="my-submissions" className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  When
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  File
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Public score
                </th>
              </tr>
            </thead>
            <tbody>
              {mine.map((submission) => (
                <tr key={submission.submissionId} className="border-b border-border">
                  <td className="py-2 pr-3 text-muted-foreground">
                    {new Date(submission.submittedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="max-w-48 truncate py-2 pr-3 font-mono text-foreground">
                    {submission.fileName}
                  </td>
                  <td
                    className="py-2 text-right font-mono text-foreground tabular-nums"
                    title={String(submission.publicScore)}
                  >
                    {submission === best && (
                      <span className="mr-2 font-sans text-xs text-muted-foreground">Best</span>
                    )}
                    {formatScore(submission.publicScore, competition.scoreDecimals)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
