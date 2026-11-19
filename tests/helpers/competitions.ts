import type { APIResponse, Page } from '@playwright/test'
import { authToken, recordsOf, roomExchange, subscribe } from './room'

/**
 * Creating competitions from a spec, through the real action.
 *
 * Test competitions are titled `__test-<time>__ …`. No action deletes a
 * competition, so their records stay in the local room; their files, which go
 * to the real platform storage, are removed with `removeStoredFiles`.
 */

export const TRAIN_CSV = [
  'id,bill_length,species',
  'a1,39.1,Adelie',
  'a2,46.5,Gentoo',
  'a3,38.2,Adelie',
  'a4,49.0,Chinstrap',
  'a5,37.8,Adelie',
  'a6,47.1,Gentoo',
  '',
].join('\n')

export const TEST_CSV = [
  'id,bill_length',
  't1,40.0',
  't2,45.9',
  't3,50.2',
  't4,38.8',
  't5,46.0',
  't6,49.5',
  '',
].join('\n')

export const SOLUTION_CSV = [
  'id,species',
  't1,Adelie',
  't2,Gentoo',
  't3,Chinstrap',
  't4,Adelie',
  't5,Gentoo',
  't6,Chinstrap',
  '',
].join('\n')

export const SAMPLE_CSV = [
  'id,species',
  't1,Adelie',
  't2,Adelie',
  't3,Adelie',
  't4,Adelie',
  't5,Adelie',
  't6,Adelie',
  '',
].join('\n')

export function competitionInput(overrides: Record<string, unknown> = {}) {
  return {
    title: `__test-${Date.now()}__ Palmer Penguins`,
    summary: 'A competition created by a Playwright spec.',
    taskType: 'classification',
    metric: 'accuracy',
    idColumn: 'id',
    targetColumn: 'species',
    deadline: Date.now() + 2 * 3_600_000,
    files: {
      train: { name: 'train.csv', csv: TRAIN_CSV },
      test: { name: 'test.csv', csv: TEST_CSV },
      solution: { name: 'solution.csv', csv: SOLUTION_CSV },
    },
    ...overrides,
  }
}

export interface ActionEnvelope {
  success: boolean
  data?: Record<string, unknown>
  code?: string
  error?: string
  issues?: { path?: string[]; message: string }[]
}

/** Call a server action as the page's signed-in user (or without a token). */
export async function callAction(
  page: Page,
  name: string,
  input: unknown,
  token: string | null,
): Promise<{ response: APIResponse; body: ActionEnvelope }> {
  const response = await page.request.post(`/api/actions/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: input,
  })
  return { response, body: (await response.json()) as ActionEnvelope }
}

export interface PublicCompetition {
  recordId: string
  data: {
    title: string
    status: string
    hostId: string
    files: Record<'train' | 'test' | 'sample', { key: string; name: string; bytes: number }>
  } & Record<string, unknown>
}

/** A competition as any visitor is sent it by the record room. */
export async function readCompetition(
  page: Page,
  competitionId: string,
): Promise<PublicCompetition | undefined> {
  const frames = await roomExchange(page, null, [subscribe('competitions')])
  const records = (recordsOf(frames, 'competitions') ?? []) as PublicCompetition[]
  return records.find((record) => record.recordId === competitionId)
}

/** Create a competition as the page's user; returns its id and the caller's token. */
export async function createCompetition(page: Page, overrides: Record<string, unknown> = {}) {
  const token = await authToken(page)
  if (!token) throw new Error('createCompetition needs a signed-in page')
  const { body } = await callAction(page, 'createCompetition', competitionInput(overrides), token)
  if (!body.success) throw new Error(`createCompetition failed: ${JSON.stringify(body)}`)
  return { competitionId: String(body.data?.competitionId), token }
}

/** Delete a competition's three files from the host's folder, as the host. */
export async function removeStoredFiles(page: Page, token: string, competitionId: string) {
  const competition = await readCompetition(page, competitionId)
  for (const file of Object.values(competition?.data.files ?? {})) {
    await page.request.delete(`/api/files/${file.key}?scope=self`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  }
}
