/* home pattern: product-preview-first — the live competition list; visitors see it read-only with a sign-in prompt */
/**
 * /home: every competition, for anyone (spec F6).
 *
 * A signed-in viewer gets "Hosting" and "Entered" first, then the other open
 * competitions and the latest closed ones. A visitor gets the same live list
 * without the first two sections, and a prompt to sign in. The arrangement is
 * src/domain/listing.ts; each row's numbers are its own subscription
 * (src/features/home/CompetitionSection.tsx).
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthOverlay, useAuth } from 'deepspace'
import { TrophyIcon } from 'lucide-react'
import { Button, buttonVariants, EmptyState } from '@/components/ui'
import { BRAND } from '../../constants'
import { arrange } from '../../domain/listing'
import { useNow } from '../../features/competition/hooks'
import { CompetitionSection } from '../../features/home/CompetitionSection'
import { useCompetitions, useEnteredIds } from '../../features/home/hooks'

const NONE_ENTERED: ReadonlySet<string> = new Set()

export default function HomePage() {
  const { userId } = useAuth()
  return userId ? (
    <MemberHome userId={userId} />
  ) : (
    <CompetitionList viewerId={null} entered={NONE_ENTERED} enteredLoading={false} />
  )
}

/** Signed in: also read which competitions the viewer has submitted to. */
function MemberHome({ userId }: { userId: string }) {
  const { entered, loading } = useEnteredIds(userId)
  return <CompetitionList viewerId={userId} entered={entered} enteredLoading={loading} />
}

interface CompetitionListProps {
  viewerId: string | null
  entered: ReadonlySet<string>
  enteredLoading: boolean
}

function CompetitionList({ viewerId, entered, enteredLoading }: CompetitionListProps) {
  const { competitions, loading } = useCompetitions()
  const now = useNow()
  const navigate = useNavigate()
  const [showSignIn, setShowSignIn] = useState(false)
  const sections = useMemo(
    () => arrange(competitions, { id: viewerId, entered }),
    [competitions, viewerId, entered],
  )
  const signIn = () => {
    setShowSignIn(true)
  }
  // The viewer's own sections can hold running competitions too.
  const anyRunning = [...sections.hosting, ...sections.entered, ...sections.open].some(
    (competition) => competition.status !== 'closed',
  )
  const section = { viewerId, now }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <title>{`Competitions · ${BRAND}`}</title>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Competitions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Submit predictions and watch the public leaderboard. Hidden rows decide your final rank.
          </p>
        </div>
        {viewerId && (
          <Link to="/host/new" data-testid="host-cta" className={buttonVariants()}>
            Host a competition
          </Link>
        )}
      </header>

      {!viewerId && (
        <div
          data-testid="sign-in-prompt"
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <p className="text-sm text-foreground">
            Sign in to submit predictions or host a competition.
          </p>
          <Button variant="outline" size="sm" onClick={signIn}>
            Sign in
          </Button>
        </div>
      )}

      {loading || enteredLoading ? (
        <div aria-busy="true" className="mt-10 space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {sections.hosting.length > 0 && (
            <CompetitionSection
              id="hosting"
              title="Hosting"
              competitions={sections.hosting}
              {...section}
            />
          )}
          {sections.entered.length > 0 && (
            <CompetitionSection
              id="entered"
              title="Entered"
              competitions={sections.entered}
              {...section}
            />
          )}
          {sections.open.length > 0 && (
            <CompetitionSection id="open" title="Open" competitions={sections.open} {...section} />
          )}
          {!anyRunning && (
            <EmptyState
              data-testid="no-open-competitions"
              icon={<TrophyIcon />}
              title="No open competitions."
              description={viewerId ? 'Host the first one.' : 'Sign in to host the first one.'}
              action={
                viewerId
                  ? { label: 'Host a competition', onClick: () => void navigate('/host/new') }
                  : { label: 'Sign in', onClick: signIn }
              }
            />
          )}
          {sections.closed.length > 0 && (
            <CompetitionSection
              id="closed"
              title="Recently closed"
              competitions={sections.closed}
              {...section}
            />
          )}
        </div>
      )}

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
