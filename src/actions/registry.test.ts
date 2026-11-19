import { describe, expect, it } from 'vitest'
import { actionContracts } from '../contracts/actions'
import type { ContractRegistry } from '../contracts/define'
import { actions } from './index'

const contracts: ContractRegistry = actionContracts

describe('action registry', () => {
  it('has exactly one handler per contract', () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(actionContracts).sort())
  })

  it('describes every action', () => {
    for (const [name, contract] of Object.entries(contracts)) {
      expect(contract.description.trim(), `${name} needs a description`).not.toBe('')
    }
  })
})
