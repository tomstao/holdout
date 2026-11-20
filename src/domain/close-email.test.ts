import { describe, expect, it } from 'vitest'
import { closeEmails, deliverable, MAX_BCC, type CloseEmailInput } from './close-email'

const input = (change: Partial<CloseEmailInput> = {}): CloseEmailInput => ({
  title: 'Palmer Penguins',
  url: 'https://holdout.app.space/c/c1',
  hostName: 'Ada',
  metricName: 'Accuracy',
  scoreDecimals: 4,
  standings: [
    { rank: 1, participantName: 'Bob', finalScore: 0.75 },
    { rank: 2, participantName: 'Ann', finalScore: 0.6 },
    { rank: 3, participantName: 'Cy', finalScore: 0.5 },
    { rank: 4, participantName: 'Dee', finalScore: 0.25 },
  ],
  hostEmail: 'ada@school.edu',
  participantEmails: ['bob@mail.com', 'ann@mail.com', 'cy@mail.com', 'dee@mail.com'],
  ...change,
})

describe('deliverable', () => {
  it('keeps an address mail can reach, trimmed', () => {
    expect(deliverable(' ada@school.edu ')).toBe('ada@school.edu')
  })

  it.each([
    undefined,
    '',
    'ada',
    'ada@school',
    'ada @school.edu',
    'ada@school.edu, bob@mail.com',
    'Ada <ada@school.edu>',
    'alice@deepspace.test',
    'Alice@DeepSpace.TEST',
    'a@b.example',
    'a@example.com',
    'a@host.invalid',
    'a@my.localhost',
  ])('refuses %j', (address) => {
    expect(deliverable(address)).toBeUndefined()
  })
})

describe('closeEmails', () => {
  it('writes one message: the host in to, the participants in bcc, replies to the host', () => {
    const messages = closeEmails(input())
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      to: 'ada@school.edu',
      bcc: ['bob@mail.com', 'ann@mail.com', 'cy@mail.com', 'dee@mail.com'],
      reply_to: 'ada@school.edu',
      subject: 'Holdout: final standings for Palmer Penguins',
      text: [
        'Holdout: "Palmer Penguins" has closed.',
        '',
        'Final standings by Accuracy on the private rows, 4 participants:',
        '1. Bob  0.7500',
        '2. Ann  0.6000',
        '3. Cy  0.5000',
        '',
        "Everyone's rank and how far they moved: https://holdout.app.space/c/c1",
        '',
        'You get this one email because you hosted or entered this competition.',
        'Replies go to the host, Ada.',
        '',
      ].join('\n'),
    })
  })

  it('names nobody past the third place and no address at all', () => {
    const [message] = closeEmails(input())
    expect(message?.text).not.toContain('Dee')
    expect(message?.text).not.toContain('@')
    expect(message?.subject).not.toContain('@')
  })

  it('says so when one person entered, and when nobody did', () => {
    const one = closeEmails(
      input({
        standings: [{ rank: 1, participantName: 'Bob', finalScore: 1 }],
        participantEmails: ['bob@mail.com'],
      }),
    )
    expect(one[0]?.text).toContain('1 participant:\n1. Bob  1.0000')

    const none = closeEmails(input({ standings: [], participantEmails: [] }))
    expect(none).toHaveLength(1)
    expect(none[0]?.bcc).toEqual([])
    expect(none[0]?.text).toContain('Nobody submitted, so there are no final standings.')
  })

  it('sends nothing when the host has no address mail can reach', () => {
    expect(closeEmails(input({ hostEmail: undefined }))).toEqual([])
    expect(closeEmails(input({ hostEmail: 'alice@deepspace.test' }))).toEqual([])
  })

  it('leaves out addresses mail cannot reach, repeats, and the host', () => {
    const [message] = closeEmails(
      input({
        participantEmails: [
          'bob@mail.com',
          undefined,
          'carol@deepspace.test',
          'BOB@mail.com',
          'Ada@School.edu',
          ' ann@mail.com ',
        ],
      }),
    )
    expect(message?.bcc).toEqual(['bob@mail.com', 'ann@mail.com'])
  })

  it('writes one message per 49 participants, the host on each', () => {
    const addresses = Array.from({ length: 2 * MAX_BCC + 1 }, (_, index) => `p${index}@mail.com`)
    const messages = closeEmails(input({ participantEmails: addresses }))
    expect(messages.map((message) => message.bcc.length)).toEqual([MAX_BCC, MAX_BCC, 1])
    expect(messages.map((message) => message.to)).toEqual(Array(3).fill('ada@school.edu'))
    expect(messages.flatMap((message) => message.bcc)).toEqual(addresses)
    // Exactly 49 is one message, not one and an empty second.
    expect(closeEmails(input({ participantEmails: addresses.slice(0, MAX_BCC) }))).toHaveLength(1)
  })

  it('keeps a title or a name with line breaks on one line', () => {
    const [message] = closeEmails(
      input({
        title: 'Penguins\r\nBcc: evil@mail.com',
        hostName: 'Ada\nLovelace',
        standings: [{ rank: 1, participantName: 'Bob\n2. Mallory  1.0000', finalScore: 0.75 }],
      }),
    )
    expect(message?.subject).toBe('Holdout: final standings for Penguins Bcc: evil@mail.com')
    expect(message?.text).toContain('1. Bob 2. Mallory 1.0000  0.7500\n')
    expect(message?.text).toContain('Replies go to the host, Ada Lovelace.')
  })
})
