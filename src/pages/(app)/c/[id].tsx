/**
 * /c/:id: a competition, for anyone. The header, then four tabs, the chosen
 * one kept in the URL (`?tab=submit`) so a link opens it.
 */
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from 'deepspace'
import { buttonVariants, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { APP_NAME } from '../../../constants'
import { CompetitionHeader } from '../../../features/competition/CompetitionHeader'
import { DataTab } from '../../../features/competition/DataTab'
import { useCompetition, useSubmissions } from '../../../features/competition/hooks'
import { LeaderboardTab } from '../../../features/competition/LeaderboardTab'
import { OverviewTab } from '../../../features/competition/OverviewTab'
import { SubmitTab } from '../../../features/competition/SubmitTab'

const TABS = ['leaderboard', 'overview', 'data', 'submit'] as const
type Tab = (typeof TABS)[number]

const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab === value)

export default function CompetitionPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { userId } = useAuth()
  const { competition, loading } = useCompetition(id)
  const { submissions, loading: submissionsLoading } = useSubmissions(id)

  if (!competition) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <title>{`Competition · ${APP_NAME}`}</title>
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
  const requested = params.get('tab')
  const tab: Tab =
    isTab(requested) && !(requested === 'submit' && isHost) ? requested : 'leaderboard'
  const choose = (next: unknown) => {
    if (typeof next !== 'string' || !isTab(next)) return
    setParams(next === 'leaderboard' ? {} : { tab: next }, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <title>{`${competition.title} · ${APP_NAME}`}</title>
      <CompetitionHeader competition={competition} />
      <Tabs value={tab} onValueChange={choose} className="mt-6">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          {!isHost && <TabsTrigger value="submit">Submit</TabsTrigger>}
        </TabsList>
        <TabsContent value="leaderboard">
          <LeaderboardTab
            competition={competition}
            submissions={submissions}
            loading={submissionsLoading}
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
              submissions={submissions}
              viewerId={userId}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
