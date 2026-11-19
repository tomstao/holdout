/**
 * Design Direction
 *
 * Product: Small prediction competitions for a class: students submit predictions,
 *   a hidden answer key decides the final standings.
 * Emotion: The last ten minutes before the board flips, when your public rank
 *   might not survive.
 * Metaphor: A chalk-ruled scoreboard in a lecture hall with a sealed envelope pinned
 *   beside it.
 * References: split-flap departure boards; Financial Times data tables; exam answer
 *   sheets (OMR forms).
 * Signature: The sealed band. Before the deadline the private column is a sealed strip
 *   across the leaderboard; at the close it opens and rows slide to their final ranks.
 * Hero: A six-row leaderboard where the sealed band lifts and three rows trade places,
 *   every few seconds.
 *
 * Style Tile
 * - Color: warm paper off-white dominant, ink near-black text, one muted signal orange
 *   for primary actions and the deadline; everything else neutral.
 * - Type: IBM Plex Sans (headings and body) with IBM Plex Mono for scores, IDs and CSV
 *   cells. Scores are compared to the fourth decimal, so tabular figures and a mono
 *   sibling keep columns aligned.
 * - Theme: light. Pages are projected in classrooms and read in daylight.
 * - Art direction: modern minimalism. The table is the hero: hairline rules, generous
 *   row height, one accent.
 * - Motion: mechanical. Rows slide to new ranks on a short linear ease; the countdown
 *   ticks; nothing else moves.
 * - Voice: second person; sentences of at most 14 words; numbers before adjectives
 *   ("3 of 5 submissions left", never "a few left").
 *
 * The page, from the DeepSpace pattern library: N2 sticky bar, H1 split hero
 * with a code-built mockup, F4 single showcase, C1 contrast band, FT1 minimal
 * footer. docs/design/frontend.md holds the reasoning.
 *
 * A STATIC page: it sits at the top level of src/pages/, so no DeepSpace
 * provider mounts (no auth fetch, no records socket), and prerender.ts renders
 * it to HTML at build. Keep it renderable without a browser: no window or
 * document during render, motion in CSS keyframes. `<Seo>` comes first.
 */
import { Link } from 'react-router-dom'
import { HeroBoard } from '../components/landing/HeroBoard'
import { SplitDiagram } from '../components/landing/SplitDiagram'
import { Seo } from '../components/Seo'
import { buttonVariants } from '../components/ui/Button'
import { Wordmark } from '../components/Wordmark'
import { seo } from '../seo'

const STEPS = [
  'You predict every row of test.csv.',
  '30 of 100 rows score the public board. You never learn which.',
  'The other 70 are scored once, at the deadline.',
  'Your two best public submissions count.',
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
            <Link to="/" aria-label="Holdout" className="rounded-sm">
              <Wordmark />
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-5 text-sm sm:flex">
              <a href="#how" className="text-muted-foreground hover:text-foreground">
                How it works
              </a>
              <Link to="/home" className="text-muted-foreground hover:text-foreground">
                Competitions
              </Link>
            </nav>
            <div className="flex-1" />
            <Link to="/home" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Open the app
            </Link>
          </div>
        </header>

        <main className="flex-1">
          <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)] lg:py-24">
            <div>
              <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                Prediction competitions for a class
              </p>
              <h1 className="mt-5 text-5xl leading-[1.04] font-semibold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                Your public score is not your grade.
              </h1>
              <p className="mt-6 max-w-md text-lg text-muted-foreground">
                Submit predictions and climb the public board. At the deadline, hidden rows decide
                the final standings.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/home"
                  data-testid="landing-cta"
                  className={buttonVariants({ size: 'lg' })}
                >
                  See the competitions
                </Link>
                <Link to="/host/new" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                  Host a competition
                </Link>
              </div>
            </div>
            <div>
              <HeroBoard />
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                The public leader finishes 5 of 6.
              </p>
            </div>
          </section>

          <section id="how" className="scroll-mt-14 border-t border-border">
            <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
              <div>
                <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                  How the split works
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  The test set is split in two.
                </h2>
                <ol className="mt-8 border-t border-border">
                  {STEPS.map((step, index) => (
                    <li key={step} className="flex gap-5 border-b border-border py-4">
                      <span className="font-mono text-sm text-muted-foreground tabular-nums">
                        0{index + 1}
                      </span>
                      <span className="text-base text-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="lg:pt-12">
                <SplitDiagram />
              </div>
            </div>
          </section>

          <section className="bg-foreground text-background">
            <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-8 px-6 py-16">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Run one for your class.
                </h2>
                <p className="mt-3 text-base">
                  Upload three CSV files, pick a metric, set a deadline.
                </p>
              </div>
              <Link to="/host/new" className={buttonVariants({ size: 'lg' })}>
                Host a competition
              </Link>
            </div>
          </section>
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
            <Wordmark />
            <p className="font-mono text-xs text-muted-foreground">
              Set in IBM Plex Sans and Mono.{' '}
              <a
                href="https://deep.space"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Built with DeepSpace
              </a>
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}
