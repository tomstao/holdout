/**
 * The Holdout wordmark: a three-row board whose middle row is the sealed
 * band, and the name set in the mono face the scores use
 * (docs/design/frontend.md). The mark is the same drawing as
 * public/favicon.svg, in the theme's ink and orange.
 */
import { cn } from '@/lib/utils'

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight text-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 18 16" aria-hidden="true" className="h-4 w-[18px] shrink-0">
        <rect x="0" y="0" width="18" height="4" className="fill-foreground" />
        <rect x="0" y="6" width="18" height="4" className="fill-primary" />
        <rect x="0" y="12" width="11" height="4" className="fill-foreground" />
      </svg>
      holdout
    </span>
  )
}
