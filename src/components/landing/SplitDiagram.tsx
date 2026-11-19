/**
 * "How the split works", drawn: 100 test rows as an answer sheet. 30 are
 * public and scattered, because nobody learns which they are; the other 70
 * are sealed. The shares are the create form's default (30%).
 */

const ROWS = 100
const PUBLIC_ROWS = 30

/** A fixed scatter: 37 is coprime with 100, so `index * 37 + 11` visits every row once. */
const isPublic = (index: number) => (index * 37 + 11) % ROWS < PUBLIC_ROWS

export function SplitDiagram() {
  return (
    <figure className="w-full">
      <div
        role="img"
        aria-label="100 test rows as a grid. 30 scattered rows are public; the other 70 are sealed."
        className="grid grid-cols-10 gap-1.5 sm:grid-cols-20"
      >
        {Array.from({ length: ROWS }, (_, index) => (
          <span
            key={index}
            className={
              isPublic(index)
                ? 'aspect-square rounded-sm bg-foreground'
                : 'sealed aspect-square rounded-sm border border-border'
            }
          />
        ))}
      </div>
      <figcaption className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <p className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-1 size-3 shrink-0 rounded-sm bg-foreground" />
          <span>
            <span className="font-mono text-foreground tabular-nums">{PUBLIC_ROWS}</span>{' '}
            <span className="text-foreground">public rows.</span>{' '}
            <span className="text-muted-foreground">Scored on every submission.</span>
          </span>
        </p>
        <p className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="sealed mt-1 size-3 shrink-0 rounded-sm border border-border"
          />
          <span>
            <span className="font-mono text-foreground tabular-nums">{ROWS - PUBLIC_ROWS}</span>{' '}
            <span className="text-foreground">private rows.</span>{' '}
            <span className="text-muted-foreground">Scored once, at the deadline.</span>
          </span>
        </p>
      </figcaption>
    </figure>
  )
}
