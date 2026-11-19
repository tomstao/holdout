/**
 * `callAction('<name>', input)`: the only way browser code calls a server
 * action. Types come from src/contracts/actions.ts.
 */
import { getAuthToken } from 'deepspace'
import { createActionClient } from '../contracts/action-client'
import { actionContracts } from '../contracts/actions'

export const callAction = createActionClient(actionContracts, {
  fetch: (url, init) => fetch(url, init),
  getToken: getAuthToken,
})
