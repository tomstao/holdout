/**
 * /c/:id: a competition, for anyone. The header, then its tabs, the chosen
 * one kept in the URL (`?tab=submit`) so a link opens it. Participants get
 * Submit; the host gets Edit instead.
 */
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from 'deepspace'
import { buttonVariants, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { BRAND } from '../../../constants'
import { CompetitionHeader } from '../../../features/competition/CompetitionHeader'
import { DataTab } from '../../../features/competition/DataTab'
import { EditTab } from '../../../features/competition/EditTab'
import {
  useCompetition,
  useFinalStandings,
  useNow,
  useSubmissions,
} from '../../../features/competition/hooks'
import { LeaderboardTab } from '../../../features/competition/LeaderboardTab'
import { OverviewTab } from '../../../features/competition/OverviewTab'
import { SubmitTab } from '../../../features/competition/SubmitTab'
import { phaseAt } from '../../../domain/time'

const TABS = ['leaderboard', 'overview', 'data', 'submit', 'edit'] as const
type Tab = (typeof TABS)[number]

const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab === value)

export default function CompetitionPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { userId } = useAuth()
  const { competition, loading } = useCompetition(id)
  const { submissions, loading: submissionsLoading } = useSubmissions(id)
  const { standings, loading: standingsLoading } = useFinalStandings(id)
  const now = useNow()

  if (!competition) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <title>{`Competition · ${BRAND}`}</title>
        {loading ? (
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

  const isHost = userId === competition.hostId
  const phase = phaseAt(competition.status, competition.deadline, now)
  const requested = params.get('tab')
  // Submit is for everyone but the host, Edit for the host alone.
  const offered = (candidate: Tab) =>
    candidate === 'submit' ? !isHost : candidate === 'edit' ? isHost : true
  const tab: Tab = isTab(requested) && offered(requested) ? requested : 'leaderboard'
  const choose = (next: unknown) => {
    if (typeof next !== 'string' || !isTab(next)) return
    setParams(next === 'leaderboard' ? {} : { tab: next }, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <title>{`${competition.title} · ${BRAND}`}</title>
      <CompetitionHeader competition={competition} phase={phase} now={now} />
      <Tabs value={tab} onValueChange={choose} className="mt-6">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          {!isHost && <TabsTrigger value="submit">Submit</TabsTrigger>}
          {isHost && <TabsTrigger value="edit">Edit</TabsTrigger>}
        </TabsList>
        <TabsContent value="leaderboard">
          <LeaderboardTab
            competition={competition}
            phase={phase}
            submissions={submissions}
            standings={standings}
            loading={submissionsLoading || standingsLoading}
            viewerId={userId}
            onSubmitClick={
              isHost
                ? undefined
                : () => {
                    choose('submit')
                  }
            }
          />
        </TabsContent>
        <TabsContent value="overview">
          <OverviewTab competition={competition} />
        </TabsContent>
        <TabsContent value="data">
          <DataTab competitionId={id} competition={competition} />
        </TabsContent>
        {!isHost && (
          <TabsContent value="submit">
            <SubmitTab
              competitionId={id}
              competition={competition}
              phase={phase}
              now={now}
              submissions={submissions}
              chosen={standings.find((row) => row.participantId === userId)?.chosen ?? []}
              viewerId={userId}
              onShowLeaderboard={() => {
                choose('leaderboard')
              }}
            />
          </TabsContent>
        )}
        {isHost && (
          <TabsContent value="edit">
            <EditTab competitionId={id} competition={competition} phase={phase} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
