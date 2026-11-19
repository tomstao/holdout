/**
 * `useCollection('<name>', query)`: the SDK's `useQuery`, typed from the
 * record registry in src/contracts/records.ts. A misspelt collection, a
 * `where` key that is not a field, or a value of the wrong type is a
 * compile error instead of an empty list at runtime.
 *
 * Browser code reads with this hook and writes only through `callAction`:
 * domain collections grant clients read access only (docs/architecture.md).
 */
import { useQuery } from 'deepspace'
import type { CollectionName, RecordOf, RecordQuery } from '../contracts/records'

export function useCollection<N extends CollectionName>(name: N, query?: RecordQuery<RecordOf<N>>) {
  return useQuery<RecordOf<N>>(name, query)
}
