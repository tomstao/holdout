import { describe, expect, it } from 'vitest'
import { isStorageBusy, withRetry, type RetryOptions } from './retry'

const busy = () => Object.assign(new Error('Storage is busy with other uploads.'), { status: 503 })

/** Options that record their sleeps instead of waiting. */
function recording(waits: number[]) {
  const slept: number[] = []
  const retried: [string, number][] = []
  const options: RetryOptions = {
    waits,
    retryable: isStorageBusy,
    sleep: (ms) => {
      slept.push(ms)
      return Promise.resolve()
    },
    onRetry: (error, wait) => retried.push([(error as Error).message, wait]),
  }
  return { options, slept, retried }
}

/** A task that fails with each of `failures` in turn, then succeeds. */
function failing(failures: Error[]) {
  let calls = 0
  const run = () => {
    const failure = failures[calls]
    calls += 1
    return failure === undefined ? Promise.resolve('stored') : Promise.reject(failure)
  }
  return { run, calls: () => calls }
}

describe('withRetry', () => {
  it('returns at once when the first attempt works', async () => {
    const { options, slept } = recording([100, 200])
    const task = failing([])
    await expect(withRetry(task.run, options)).resolves.toBe('stored')
    expect(task.calls()).toBe(1)
    expect(slept).toEqual([])
  })

  it('tries again after each wait while storage is busy', async () => {
    const { options, slept, retried } = recording([100, 200, 300])
    const task = failing([busy(), busy()])
    await expect(withRetry(task.run, options)).resolves.toBe('stored')
    expect(task.calls()).toBe(3)
    expect(slept).toEqual([100, 200])
    expect(retried).toEqual([
      ['Storage is busy with other uploads.', 100],
      ['Storage is busy with other uploads.', 200],
    ])
  })

  it('gives up after the last wait and throws the last failure', async () => {
    const { options, slept } = recording([100, 200])
    const last = busy()
    const task = failing([busy(), busy(), last, busy()])
    await expect(withRetry(task.run, options)).rejects.toBe(last)
    expect(task.calls()).toBe(3)
    expect(slept).toEqual([100, 200])
  })

  it('does not retry a failure that will not go away', async () => {
    const { options, slept } = recording([100, 200])
    const tooLarge = Object.assign(new Error('The upload is too large.'), { status: 413 })
    const task = failing([tooLarge])
    await expect(withRetry(task.run, options)).rejects.toBe(tooLarge)
    expect(task.calls()).toBe(1)
    expect(slept).toEqual([])
  })

  it('makes one attempt when there are no waits', async () => {
    const { options } = recording([])
    const task = failing([busy()])
    await expect(withRetry(task.run, options)).rejects.toThrow('busy')
    expect(task.calls()).toBe(1)
  })

  it('works without a log callback', async () => {
    const task = failing([busy()])
    const result = withRetry(task.run, {
      waits: [1],
      retryable: isStorageBusy,
      sleep: () => Promise.resolve(),
    })
    await expect(result).resolves.toBe('stored')
  })
})

describe('isStorageBusy', () => {
  it('recognises the storage answer by its status', () => {
    expect(isStorageBusy(busy())).toBe(true)
    expect(isStorageBusy({ status: 503 })).toBe(true)
  })

  it('says no to every other failure', () => {
    for (const other of [
      Object.assign(new Error('Not authorized'), { status: 403 }),
      new Error('network'),
      { status: '503' },
      'Storage is busy',
      null,
      undefined,
    ]) {
      expect(isStorageBusy(other)).toBe(false)
    }
  })
})
