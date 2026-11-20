import { describe, expect, it } from 'vitest'
import { closeEmail, deliverable, type CloseEmailInput } from './close-email'

const input = (change: Partial<CloseEmailInput> = {}): CloseEmailInput => ({
  title: 'Palmer Penguins',
  url: 'https://holdout.app.space/c/c1',
  metricName: 'Accuracy',
  scoreDecimals: 4,
  standings: [
    { rank: 1, participantName: 'Bob', finalScore: 0.75 },
    { rank: 2, participantName: 'Ann', finalScore: 0.6 },
    { rank: 3, participantName: 'Cy', finalScore: 0.5 },
    { rank: 4, participantName: 'Dee', finalScore: 0.25 },
  ],
  hostEmail: 'ada@school.edu',
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

describe('closeEmail', () => {
  it('writes one message to the host: the top three and the link', () => {
    expect(closeEmail(input())).toEqual({
      to: 'ada@school.edu',
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
        'You get this one email because you host this competition. Nobody else gets it.',
        '',
      ].join('\n'),
    })
  })

  it('has one recipient and no way to add another', () => {
    // The host alone: anyone else on the message would be shown the host's address.
    expect(Object.keys(closeEmail(input()) ?? {}).sort()).toEqual(['subject', 'text', 'to'])
  })

  it('names nobody past the third place and no address at all', () => {
    const message = closeEmail(input())
    expect(message?.text).not.toContain('Dee')
    expect(message?.text).not.toContain('@')
    expect(message?.subject).not.toContain('@')
  })

  it('says so when one person entered, and when nobody did', () => {
    const one = closeEmail(
      input({ standings: [{ rank: 1, participantName: 'Bob', finalScore: 1 }] }),
    )
    expect(one?.text).toContain('1 participant:\n1. Bob  1.0000')

    const none = closeEmail(input({ standings: [] }))
    expect(none?.to).toBe('ada@school.edu')
    expect(none?.text).toContain('Nobody submitted, so there are no final standings.')
  })

  it('writes nothing when the host has no address mail can reach', () => {
    expect(closeEmail(input({ hostEmail: undefined }))).toBeUndefined()
    expect(closeEmail(input({ hostEmail: 'alice@deepspace.test' }))).toBeUndefined()
  })

  it('keeps a title or a name with line breaks on one line', () => {
    const message = closeEmail(
      input({
        title: 'Penguins\r\nBcc: evil@mail.com',
        standings: [{ rank: 1, participantName: 'Bob\n2. Mallory  1.0000', finalScore: 0.75 }],
      }),
    )
    expect(message?.subject).toBe('Holdout: final standings for Penguins Bcc: evil@mail.com')
    expect(message?.text).toContain('1. Bob 2. Mallory 1.0000  0.7500\n')
  })
})
