/**
 * The close-out email (spec F4, step 6): the host in `to`, the participants in `bcc`,
 * the top three and a link.
 *
 * Pure: it takes addresses and standings and returns messages. Who is asked for the
 * addresses, and what sends the result, is the close job's business
 * (src/server/close.ts).
 *
 * The platform sends as "DeepSpace Apps" from its own address, so the subject and the
 * first line name Holdout. Replies go to the host.
 */
import { formatScore } from './ranking'

/**
 * Participants per message. The platform's mail provider takes 50 recipients in
 * one message and the host is one of them. A larger competition gets one message per
 * 49 participants, with the host on each.
 */
export const MAX_BCC = 49

/** The names shown in the email. */
export const TOP_ROWS = 3

/** One `email/send` request (docs/decisions/0012-integrations-email-only.md). */
export interface CloseEmail {
  to: string
  bcc: string[]
  reply_to: string
  subject: string
  text: string
}

export interface CloseEmailInput {
  title: string
  /** The competition's page. */
  url: string
  hostName: string
  metricName: string
  scoreDecimals: number
  /** The final standings, winner first. Only the first three are named. */
  standings: readonly { rank: number; participantName: string; finalScore: number }[]
  hostEmail: string | undefined
  participantEmails: readonly (string | undefined)[]
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
  const title = oneLine(input.title)
  const count = input.standings.length
  const lines = [`Holdout: "${title}" has closed.`, '']
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
    'You get this one email because you hosted or entered this competition.',
    `Replies go to the host, ${oneLine(input.hostName)}.`,
    '',
  )
  return lines.join('\n')
}

/**
 * The messages for a closed competition: none when the host has no address mail can
 * reach, otherwise one per 49 participants (one when there are fewer, or none).
 */
export function closeEmails(input: CloseEmailInput): CloseEmail[] {
  const host = deliverable(input.hostEmail)
  if (host === undefined) return []

  const seen = new Set([host.toLowerCase()])
  const participants: string[] = []
  for (const address of input.participantEmails) {
    const found = deliverable(address)
    if (found === undefined || seen.has(found.toLowerCase())) continue
    seen.add(found.toLowerCase())
    participants.push(found)
  }

  const subject = `Holdout: final standings for ${oneLine(input.title)}`
  const text = bodyOf(input)
  const messages: CloseEmail[] = []
  for (let from = 0; from === 0 || from < participants.length; from += MAX_BCC) {
    messages.push({
      to: host,
      bcc: participants.slice(from, from + MAX_BCC),
      reply_to: host,
      subject,
      text,
    })
  }
  return messages
}
