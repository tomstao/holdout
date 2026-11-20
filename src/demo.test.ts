import { describe, expect, it } from 'vitest'
import { DEMO_COMPETITION_ID, landingCallToAction } from './demo'

describe('the landing call to action', () => {
  it('goes to the demo competition when there is one', () => {
    expect(landingCallToAction('ff94aae4-8438-4ed6-a3c4-37bbd7850ca2')).toEqual({
      label: 'Try the demo competition',
      to: '/c/ff94aae4-8438-4ed6-a3c4-37bbd7850ca2',
    })
  })

  it('keeps the list, and says so, when there is none', () => {
    expect(landingCallToAction(undefined)).toEqual({
      label: 'See the competitions',
      to: '/home',
    })
  })

  it('has no demo outside a production build', () => {
    // The record is in the live room only. A test run that got the id would send its
    // landing button to a page that does not exist.
    expect(DEMO_COMPETITION_ID).toBeUndefined()
  })
})
