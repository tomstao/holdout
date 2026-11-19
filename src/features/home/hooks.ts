/**
 * The live data the competition list on /home reads: every competition, and
 * which of them the signed-in viewer has submitted to.
 */
import { useMemo } from 'react'
import { useCollection } from '../../client/records'
import type { CompetitionRecord } from '../../contracts/competitions'

export interface ListedCompetition extends CompetitionRecord {
  id: string
}

/** Every competition, live. Records are about 1 KB each. */
export function useCompetitions() {
  const { records, status } = useCollection('competitions')
  const competitions = useMemo(
    () => records.map((record): ListedCompetition => ({ ...record.data, id: record.recordId })),
    [records],
  )
  return { competitions, loading: status === 'loading' }
}

/** The ids of the competitions `userId` has submitted to, from their own submissions. */
export function useEnteredIds(userId: string) {
  const { records, status } = useCollection('submissions', { where: { participantId: userId } })
  const entered = useMemo(
    () => new Set(records.map((record) => record.data.competitionId)),
    [records],
  )
  return { entered, loading: status === 'loading' }
}
