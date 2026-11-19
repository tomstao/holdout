import type { ActionResult } from 'deepspace/worker'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { answerKeyRecord, competitionRecord } from '../contracts/competitions'
import { formatCsv } from '../domain/csv'
import { HOUR_MS } from '../domain/time'
import { makeCreateCompetition, type HostFiles } from './create-competition'
import { fakeRoom, type FakeRoom } from './fakes'

const NOW = 1_795_000_000_000
const HOST = 'user_host'

const TRAIN = formatCsv(
  ['id', 'bill', 'species'],
  [
    ['a1', '39.1', 'Adelie'],
    ['a2', '46.5', 'Gentoo'],
    ['a3', '38.2', 'Adelie'],
  ],
)
const TEST = formatCsv(
  ['id', 'bill'],
  [
    ['t1', '40.0'],
    ['t2', '45.9'],
    ['t3', '50.2'],
    ['t4', '38.8'],
  ],
)
const SOLUTION = formatCsv(
  ['id', 'species'],
  [
    ['t1', 'Adelie'],
    ['t2', 'Gentoo'],
    ['t3', 'Gentoo'],
    ['t4', 'Adelie'],
  ],
)

const VALID = {
  title: 'Palmer Penguins',
  summary: 'Predict the species of a penguin from its bill.',
  taskType: 'classification',
  metric: 'accuracy',
  idColumn: 'id',
  targetColumn: 'species',
  deadline: NOW + 24 * HOUR_MS,
  files: {
    train: { name: 'my train.csv', csv: TRAIN },
    test: { name: 'my test.csv', csv: TEST },
    solution: { name: 'my solution.csv', csv: SOLUTION },
  },
}

/** A host folder in memory; `failAt` makes the n-th upload throw. */
function fakeFiles(failAt = 0) {
  const stored = new Map<string, { name: string; text: string }>()
  const removed: string[] = []
  let puts = 0
  const files: HostFiles = {
    put(key, name, text) {
      puts++
      if (puts === failAt) return Promise.reject(new Error('storage is down'))
      const storedKey = `apps/app_x/users/${HOST}/${key}`
      stored.set(storedKey, { name, text })
      return Promise.resolve(storedKey)
    },
    remove(storedKey) {
      removed.push(storedKey)
      stored.delete(storedKey)
      return Promise.resolve()
    },
  }
  return { files, stored, removed }
}

interface Setup {
  room?: FakeRoom
  files?: ReturnType<typeof fakeFiles>
}

async function create(params: Record<string, unknown>, setup: Setup = {}) {
  const room =
    setup.room ?? fakeRoom({ users: { [HOST]: { name: 'Ada', email: 'ada@example.org' } } })
  const files = setup.files ?? fakeFiles()
  const seen: { folderOf?: string } = {}
  const action = makeCreateCompetition({
    hostFiles: (_env, hostId) => {
      seen.folderOf = hostId
      return files.files
    },
    now: () => NOW,
    seed: () => 7,
    newId: () => 'comp_1',
  })
  const result = (await action({
    userId: HOST,
    params,
    tools: room.tools,
    env: {} as Env,
    callerJwt: 'jwt',
  })) as ActionResult<{ competitionId: string }> & {
    issues?: { path?: string[]; message: string }[]
  }
  return { result, room, files, seen }
}

describe('createCompetition', () => {
  it('stores the files, then the answer key, then the competition', async () => {
    const { result, room, files, seen } = await create(VALID)

    expect(result).toEqual({ success: true, data: { competitionId: 'comp_1' } })
    expect(seen.folderOf).toBe(HOST)
    expect([...files.stored.keys()]).toEqual([
      `apps/app_x/users/${HOST}/competitions/comp_1/train.csv`,
      `apps/app_x/users/${HOST}/competitions/comp_1/test.csv`,
      `apps/app_x/users/${HOST}/competitions/comp_1/sample.csv`,
    ])
    expect(room.calls.filter((call) => call.startsWith('create:'))).toEqual([
      'create:answer_keys:comp_1',
      'create:competitions:comp_1',
    ])
  })

  it('writes an answer key that fits its contract and covers every test row', async () => {
    const { room } = await create(VALID)
    const key = answerKeyRecord.parse(room.rows('answer_keys').get('comp_1'))
    expect(key.competitionId).toBe('comp_1')
    expect(key.rowCount).toBe(4)
    expect(key.rows.map(([id, target]) => [id, target])).toEqual([
      ['t1', 'Adelie'],
      ['t2', 'Gentoo'],
      ['t3', 'Gentoo'],
      ['t4', 'Adelie'],
    ])
    expect(key.rows.map(([, , split]) => split).sort()).toEqual([
      'private',
      'private',
      'public',
      'public',
    ])
  })

  it('writes an open competition that fits its contract', async () => {
    const { room, files } = await create(VALID)
    const competition = competitionRecord.parse(room.rows('competitions').get('comp_1'))
    expect(competition).toMatchObject({
      title: 'Palmer Penguins',
      description: '',
      taskType: 'classification',
      metric: 'accuracy',
      labels: ['Adelie', 'Gentoo'],
      deadline: NOW + 24 * HOUR_MS,
      dailyLimit: 5,
      scoreDecimals: 4,
      testRows: 4,
      publicRows: 2,
      privateRows: 2,
      status: 'open',
      hostId: HOST,
      hostName: 'Ada',
    })
    expect(competition.closedAt).toBeUndefined()
    expect(competition.files.train).toEqual({
      key: `apps/app_x/users/${HOST}/competitions/comp_1/train.csv`,
      name: 'my train.csv',
      bytes: TRAIN.length,
    })
    expect(competition.files.sample.name).toBe('sample_submission.csv')
    expect(files.stored.get(competition.files.sample.key)?.text).toBe(
      'id,species\nt1,Adelie\nt2,Adelie\nt3,Adelie\nt4,Adelie\n',
    )
  })

  it('keeps the answers and the host email out of the public record', async () => {
    const { room } = await create(VALID)
    const competition = JSON.stringify(room.rows('competitions').get('comp_1'))
    expect(competition).not.toContain('ada@example.org')
    expect(competition).not.toContain('"rows"')
    expect(competition).not.toContain('my solution.csv')
    // The counts are public; which rows are in which half is not.
    expect(competition).not.toContain('"private"')
    expect(competition).not.toContain('"public"')
  })

  it('takes the host from the verified caller, never from the input', async () => {
    const { room } = await create({ ...VALID, hostId: 'someone_else', hostName: 'Mallory' })
    expect(room.rows('competitions').get('comp_1')).toMatchObject({ hostId: HOST, hostName: 'Ada' })
  })

  it('calls a host without a name "Host"', async () => {
    const noRow = await create(VALID, { room: fakeRoom() })
    expect(noRow.room.rows('competitions').get('comp_1')?.hostName).toBe('Host')
    const blank = await create(VALID, { room: fakeRoom({ users: { [HOST]: { name: '  ' } } }) })
    expect(blank.room.rows('competitions').get('comp_1')?.hostName).toBe('Host')
  })

  it('stores a regression competition without labels', async () => {
    const { result, room } = await create({
      ...VALID,
      taskType: 'regression',
      metric: 'rmse',
      targetColumn: 'price',
      files: {
        train: { name: 'train.csv', csv: 'id,price\na1,10\na2,20\n' },
        test: { name: 'test.csv', csv: 'id,rooms\nt1,2\nt2,3\n' },
        solution: { name: 'solution.csv', csv: 'id,price\nt1,12.5\nt2,18\n' },
      },
    })
    expect(result.success).toBe(true)
    const stored = room.rows('competitions').get('comp_1')
    expect(stored).not.toHaveProperty('labels')
    expect(competitionRecord.parse(stored).metric).toBe('rmse')
  })
})

describe('createCompetition refusals', () => {
  const nothingStored = ({ room, files }: Awaited<ReturnType<typeof create>>) => {
    expect(room.rows('competitions').size).toBe(0)
    expect(room.rows('answer_keys').size).toBe(0)
    expect(files.stored.size).toBe(0)
  }

  it('refuses input that breaks the contract, with the field', async () => {
    const short = await create({ ...VALID, title: 'ab' })
    expect(short.result).toMatchObject({ success: false, code: 'invalid_input' })
    expect(short.result.issues?.map((issue) => issue.path)).toEqual([['title']])
    nothingStored(short)

    const mismatch = await create({ ...VALID, metric: 'rmse' })
    expect(mismatch.result.issues).toEqual([
      { path: ['metric'], message: 'This metric does not fit the task type.' },
    ])

    const sameColumn = await create({ ...VALID, targetColumn: 'id' })
    expect(sameColumn.result.issues?.[0]?.path).toEqual(['targetColumn'])
  })

  it('refuses a deadline outside one hour to 90 days, by the server clock', async () => {
    const soon = await create({ ...VALID, deadline: NOW + HOUR_MS - 1 })
    expect(soon.result).toEqual({
      success: false,
      code: 'invalid_input',
      error: 'The deadline is not valid.',
      issues: [{ path: ['deadline'], message: 'The deadline must be at least 1 hour from now.' }],
    })
    nothingStored(soon)

    const far = await create({ ...VALID, deadline: NOW + 91 * 24 * HOUR_MS })
    expect(far.result.issues?.[0]?.message).toBe('The deadline must be within 90 days from now.')
  })

  it('refuses files with problems and says where they are', async () => {
    const refused = await create({
      ...VALID,
      files: {
        ...VALID.files,
        solution: {
          name: 'solution.csv',
          csv: 'id,species\nt1,Adelie\nt2,\nt9,Gentoo\nt4,Adelie\n',
        },
      },
    })
    expect(refused.result).toMatchObject({
      success: false,
      code: 'invalid_file',
      error: 'The files have problems. Fix them and try again.',
    })
    expect(refused.result.issues).toEqual([
      { path: ['test', 'row 4', 'id'], message: 'The ID "t3" is not in solution.csv.' },
      { path: ['solution', 'row 3', 'species'], message: 'The target is empty.' },
      { path: ['solution', 'row 4', 'id'], message: 'The ID "t9" is not in test.csv.' },
    ])
    nothingStored(refused)
  })
})

describe('createCompetition when storing fails', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => undefined)

  it('removes the files already stored when an upload fails', async () => {
    const error = quiet()
    const files = fakeFiles(2)
    const { result, room } = await create(VALID, { files })
    expect(result).toEqual({
      success: false,
      code: 'internal',
      error: 'We could not save the competition. Nothing was created. Try again.',
    })
    expect(files.removed).toEqual([`apps/app_x/users/${HOST}/competitions/comp_1/train.csv`])
    expect(files.stored.size).toBe(0)
    expect(room.calls.some((call) => call.startsWith('create:'))).toBe(false)
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('removes the files when the answer key cannot be written', async () => {
    const error = quiet()
    const room = fakeRoom()
    room.failOn('create:answer_keys')
    const { result, files } = await create(VALID, { room })
    expect(result).toMatchObject({ success: false, code: 'internal' })
    expect(files.removed).toHaveLength(3)
    expect(room.rows('answer_keys').size).toBe(0)
    expect(room.rows('competitions').size).toBe(0)
    error.mockRestore()
  })

  it('removes the answer key and the files when the competition cannot be written', async () => {
    const error = quiet()
    const room = fakeRoom()
    room.failOn('create:competitions')
    const { result, files } = await create(VALID, { room })
    expect(result).toMatchObject({ success: false, code: 'internal' })
    expect(room.calls).toContain('remove:answer_keys:comp_1')
    expect(room.rows('answer_keys').size).toBe(0)
    expect(room.rows('competitions').size).toBe(0)
    expect(files.stored.size).toBe(0)
    // The reason is logged for the owner, never sent to the caller.
    expect(String(error.mock.calls[0]?.[0])).toContain('competitions: fake failure')
    expect(JSON.stringify(result)).not.toContain('fake failure')
    error.mockRestore()
  })
})
