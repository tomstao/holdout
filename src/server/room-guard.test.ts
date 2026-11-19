import { describe, expect, it } from 'vitest'
import { namesCollection } from './room-guard'

const BUILT_IN = new Set(['canvas-settings'])
const frame = (value: unknown) => JSON.stringify(value)

describe('namesCollection', () => {
  it('finds a write, a delete and a Yjs join by their collection', () => {
    for (const type of ['core.put', 'core.delete', 'yjs.join']) {
      const message = frame({ type, payload: { collection: 'canvas-settings', recordId: 'x' } })
      expect(namesCollection(message, BUILT_IN)).toBe(true)
    }
  })

  it('finds a subscription by its query', () => {
    const message = frame({
      type: 'core.subscribe',
      payload: { subscriptionId: 's', query: { collection: 'canvas-settings' } },
    })
    expect(namesCollection(message, BUILT_IN)).toBe(true)
  })

  it('lets the app’s own collections through', () => {
    for (const collection of ['competitions', 'submissions', 'answer_keys', 'users']) {
      expect(
        namesCollection(
          frame({ type: 'core.subscribe', payload: { query: { collection } } }),
          BUILT_IN,
        ),
      ).toBe(false)
      expect(namesCollection(frame({ type: 'core.put', payload: { collection } }), BUILT_IN)).toBe(
        false,
      )
    }
  })

  it('does not match the name inside data or a filter', () => {
    const inData = frame({
      type: 'core.put',
      payload: { collection: 'competitions', data: { title: 'canvas-settings' } },
    })
    const inWhere = frame({
      type: 'core.subscribe',
      payload: { query: { collection: 'competitions', where: { collection: 'canvas-settings' } } },
    })
    expect(namesCollection(inData, BUILT_IN)).toBe(false)
    expect(namesCollection(inWhere, BUILT_IN)).toBe(false)
  })

  it('leaves frames it cannot read to the room', () => {
    for (const message of [
      'not json',
      '',
      'null',
      '42',
      '"canvas-settings"',
      '[]',
      frame({ type: 'core.user_list' }),
      frame({ type: 'core.put', payload: null }),
      frame({ type: 'core.put', payload: 'canvas-settings' }),
      frame({ type: 'core.put', payload: { collection: 7 } }),
      frame({ type: 'core.subscribe', payload: { query: 'canvas-settings' } }),
    ]) {
      expect(namesCollection(message, BUILT_IN)).toBe(false)
    }
  })

  it('refuses nothing when there are no built-in collections', () => {
    const message = frame({ type: 'core.put', payload: { collection: 'canvas-settings' } })
    expect(namesCollection(message, new Set())).toBe(false)
  })
})
