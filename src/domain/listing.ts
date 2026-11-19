/**
 * How the competition list on /home is arranged (spec F6): which section a
 * competition belongs to for a viewer, and the order inside each.
 */
import type { Phase } from './time'

/** What the arrangement needs to know about a competition. */
export interface Listed {
  id: string
  hostId: string
  status: Phase
  deadline: number
  closedAt?: number
}

export interface Viewer {
  /** Absent for a signed-out visitor. */
  id: string | null
  /** The competitions the viewer has submitted to. */
  entered: ReadonlySet<string>
}

export interface Sections<T> {
  /** The viewer hosts these. */
  hosting: T[]
  /** The viewer has submitted to these. */
  entered: T[]
  /** Every other competition that is not closed yet. */
  open: T[]
  /** The other closed competitions, the latest first, at most `recentlyClosed` of them. */
  closed: T[]
}

/** How many closed competitions the "Recently closed" section shows. */
export const RECENTLY_CLOSED = 5

const closedAt = (competition: Listed) => competition.closedAt ?? competition.deadline

/**
 * Running competitions first, the one that ends soonest on top; then closed
 * ones, the latest first. A tie goes to the id, so the order never flickers.
 */
function byUrgency(a: Listed, b: Listed): number {
  const aClosed = a.status === 'closed'
  const bClosed = b.status === 'closed'
  if (aClosed !== bClosed) return aClosed ? 1 : -1
  const order = aClosed ? closedAt(b) - closedAt(a) : a.deadline - b.deadline
  return order !== 0 ? order : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Each competition appears once: under "hosting" if the viewer hosts it,
 * else "entered" if they submitted to it, else "open" or "closed" by its
 * status. The record's status decides, not the clock: a competition whose
 * deadline has just passed stays under "open" until the close job is done.
 */
export function arrange<T extends Listed>(
  competitions: readonly T[],
  viewer: Viewer,
  recentlyClosed = RECENTLY_CLOSED,
): Sections<T> {
  const sections: Sections<T> = { hosting: [], entered: [], open: [], closed: [] }
  for (const competition of [...competitions].sort(byUrgency)) {
    if (viewer.id !== null && competition.hostId === viewer.id) sections.hosting.push(competition)
    else if (viewer.entered.has(competition.id)) sections.entered.push(competition)
    else if (competition.status !== 'closed') sections.open.push(competition)
    else if (sections.closed.length < recentlyClosed) sections.closed.push(competition)
  }
  return sections
}
