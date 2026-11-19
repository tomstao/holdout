/**
 * The landing page's signature: a six-row leaderboard whose private column is
 * sealed. On a 12-second loop the seal lifts, three rows slide to their final
 * ranks, the board holds, and it resets.
 *
 * Built from markup and CSS keyframes (`.board-*` in src/styles.css), so the
 * prerendered page animates before any script runs and nothing reads
 * `window`. Under prefers-reduced-motion the keyframes are off and the board
 * stays as it is before the deadline: public scores, sealed column.
 *
 * The rank numbers are their own column and do not move. A row carries its
 * name and scores to a new rank; `shift` is how many rows down it ends.
 */
import type { CSSProperties } from 'react'
import { cn } from '../../lib/utils'

interface Entry {
  name: string
  publicScore: string
  privateScore: string
  /** Rows moved at the close: negative is up the board. */
  shift: number
}

/** In public order. The public leader overfits the public rows and finishes fifth. */
const ENTRIES: readonly Entry[] = [
  { name: 'Mira', publicScore: '0.9412', privateScore: '0.9031', shift: 4 },
  { name: 'Tomas', publicScore: '0.9388', privateScore: '0.9214', shift: 0 },
  { name: 'Ines', publicScore: '0.9301', privateScore: '0.9187', shift: 0 },
  { name: 'Kofi', publicScore: '0.9267', privateScore: '0.9302', shift: -3 },
  { name: 'Lena', publicScore: '0.9105', privateScore: '0.9066', shift: -1 },
  { name: 'Arjun', publicScore: '0.8990', privateScore: '0.8954', shift: 0 },
]

const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem_2.75rem] items-center'

function ShakeUp({ shift }: { shift: number }) {
  if (shift === 0) return <span className="text-muted-foreground">–</span>
  return (
    <span className={shift < 0 ? 'text-success' : 'text-destructive'}>
      {shift < 0 ? '▲' : '▼'} {Math.abs(shift)}
    </span>
  )
}

export function HeroBoard() {
  return (
    <figure
      role="img"
      aria-label="An example leaderboard with six participants. Before the deadline the private scores are sealed. At the close the seal lifts and three participants change rank: the public leader finishes fifth."
      className="board w-full rounded-lg border border-border bg-card text-sm"
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            Leaderboard · accuracy
          </p>
          <p className="relative font-mono text-xs tracking-wide uppercase">
            <span className="board-open text-primary">Open</span>
            <span className="board-final absolute top-0 right-0 text-foreground">Final</span>
          </p>
        </div>

        <div className="flex border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="w-8">#</span>
          <div className={`${COLUMNS} flex-1`}>
            <span>Participant</span>
            <span className="text-right">Public</span>
            <span className="text-right">Private</span>
            <span />
          </div>
        </div>

        <div className="relative flex px-4">
          <ol className="w-8 font-mono text-muted-foreground tabular-nums">
            {ENTRIES.map((entry, index) => (
              <li key={entry.name} className="flex h-(--row) items-center">
                {index + 1}
              </li>
            ))}
          </ol>
          <ul className="relative flex-1">
            {ENTRIES.map((entry, index) => (
              <li
                key={entry.name}
                style={{ '--shift': entry.shift } as CSSProperties}
                className={cn(
                  'board-row relative h-(--row) bg-card',
                  COLUMNS,
                  // The bottom row never moves and the card's edge is its rule.
                  index < ENTRIES.length - 1 && 'border-b border-border',
                  // A row on the move passes over the ones that stay.
                  entry.shift !== 0 && 'z-10',
                )}
              >
                <span className="truncate text-foreground">{entry.name}</span>
                <span className="text-right font-mono text-foreground tabular-nums">
                  {entry.publicScore}
                </span>
                <span className="text-right font-mono text-foreground tabular-nums">
                  {entry.privateScore}
                </span>
                <span className="board-shake text-right font-mono text-xs tabular-nums">
                  <ShakeUp shift={entry.shift} />
                </span>
              </li>
            ))}
            {/* The sealed band: it covers the private column and lifts at the close. */}
            <li className="pointer-events-none absolute inset-y-0 right-[2.75rem] z-20 w-[4.75rem] overflow-hidden pl-2">
              <div className="board-seal flex h-full items-center justify-center border-x border-border">
                <span className="rotate-180 bg-card px-0.5 py-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase [writing-mode:vertical-rl]">
                  Sealed
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </figure>
  )
}
