/**
 * The live data the competition page reads: the competition record, its
 * public submissions as the ranking wants them, and a clock.
 */
import { useEffect, useMemo, useState } from 'react'
import { useCollection } from '../../client/records'
import type { CompetitionRecord } from '../../contracts/competitions'
import type { ScoredSubmission } from '../../domain/ranking'

export function useCompetition(id: string) {
  const { records, status } = useCollection('competitions')
  const competition: CompetitionRecord | undefined = records.find(
    (record) => record.recordId === id,
  )?.data
  return { competition, loading: status === 'loading' }
}

export interface Submission extends ScoredSubmission {
  fileName: string
  utcDay: string
  slot: number
}

/**
 * Every submission to a competition, live. No `limit`: a subscription with a
 * limit stops delivering new rows once it is reached (docs/lessons.md).
 */
export function useSubmissions(competitionId: string) {
  const { records, status } = useCollection('submissions', { where: { competitionId } })
  const submissions = useMemo(
    () =>
      records.map((record): Submission => ({
        submissionId: record.recordId,
        participantId: record.data.participantId,
        participantName: record.data.participantName,
        publicScore: record.data.publicScore,
        submittedAt: Date.parse(record.createdAt),
        fileName: record.data.fileName,
        utcDay: record.data.utcDay,
        slot: record.data.slot,
      })),
    [records],
  )
  return { submissions, loading: status === 'loading' }
}

/** The final standings the close job wrote; empty until the competition is closed. */
export function useFinalStandings(competitionId: string) {
  const { records, status } = useCollection('final_standings', { where: { competitionId } })
  const standings = useMemo(() => records.map((record) => record.data), [records])
  return { standings, loading: status === 'loading' }
}

/** The current time, updated every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, intervalMs)
    return () => {
      clearInterval(timer)
    }
  }, [intervalMs])
  return now
}
