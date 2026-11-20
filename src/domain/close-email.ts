/**
 * The close-out email (spec F4, step 6): one message to the host, with the top three
 * and a link.
 *
 * To the host alone. A message needs somebody in `to`, and whoever is there is shown
 * to every other recipient, so writing to the participants as well would hand each of
 * them the host's address (docs/decisions/0012-integrations-email-only.md).
 *
 * Pure: it takes an address and standings and returns a message. Who is asked for the
 * address, and what sends the result, is the close job's business
 * (src/server/close.ts).
 *
 * The platform sends as "DeepSpace Apps" from its own address, so the subject and the
 * first line name Holdout.
 */
import { formatScore } from './ranking'

/** The names shown in the email. */
export const TOP_ROWS = 3

/** One `email/send` request. */
export interface CloseEmail {
  to: string
  subject: string
  text: string
}

export interface CloseEmailInput {
  title: string
  /** The competition's page. */
  url: string
  metricName: string
  scoreDecimals: number
  /** The final standings, winner first. Only the first three are named. */
  standings: readonly { rank: number; participantName: string; finalScore: number }[]
  hostEmail: string | undefined
}

/** Domains that can never receive mail (RFC 2606), which is what test accounts use. */
const RESERVED = /(\.(test|example|invalid|localhost)|@example\.(com|net|org))$/

const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

/** The address, trimmed, if mail to it can arrive; `undefined` otherwise. */
export function deliverable(address: string | undefined): string | undefined {
  const trimmed = (address ?? '').trim()
  if (!ADDRESS.test(trimmed) || RESERVED.test(trimmed.toLowerCase())) return undefined
  return trimmed
}

/** One line of text, whatever a title or a name contains. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

function bodyOf(input: CloseEmailInput): string {
  const count = input.standings.length
  const lines = [`Holdout: "${oneLine(input.title)}" has closed.`, '']
  if (count === 0) {
    lines.push('Nobody submitted, so there are no final standings.')
  } else {
    lines.push(
      `Final standings by ${input.metricName} on the private rows, ` +
        `${count} ${count === 1 ? 'participant' : 'participants'}:`,
    )
    for (const row of input.standings.slice(0, TOP_ROWS)) {
      lines.push(
        `${row.rank}. ${oneLine(row.participantName)}  ` +
          formatScore(row.finalScore, input.scoreDecimals),
      )
    }
  }
  lines.push(
    '',
    `Everyone's rank and how far they moved: ${input.url}`,
    '',
    'You get this one email because you host this competition. Nobody else gets it.',
    '',
  )
  return lines.join('\n')
}

/** The message for a closed competition, or none when mail cannot reach its host. */
export function closeEmail(input: CloseEmailInput): CloseEmail | undefined {
  const host = deliverable(input.hostEmail)
  if (host === undefined) return undefined
  return {
    to: host,
    subject: `Holdout: final standings for ${oneLine(input.title)}`,
    text: bodyOf(input),
  }
}
