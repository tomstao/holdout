/**
 * The two permission sets every Holdout collection uses
 * (docs/architecture.md, "Permissions").
 *
 * No client role may create, update or delete anything: every write goes
 * through a server action, which checks the caller itself.
 */
import type { CollectionSchema } from 'deepspace/schema'

type RoleRule = CollectionSchema['permissions'][string]

/** `*` is a signed-out visitor; the app owner is always `admin`. */
const everyRole = (rule: RoleRule): CollectionSchema['permissions'] => ({
  '*': rule,
  viewer: rule,
  member: rule,
  admin: rule,
})

/** Anyone may read, signed in or not. */
export const READ_ONLY = everyRole({ read: true, create: false, update: false, delete: false })

/**
 * No browser receives these rows, the app owner's included. Only Worker code
 * (actions, the cron task, jobs) reads them, with RBAC off.
 *
 * A closed collection must not declare an `immutable` column. On an update
 * the record room compares an immutable field with the stored value before
 * it checks permission: a client that guesses the value is told
 * `UPDATE DENIED`, one that guesses wrong is told
 * `Cannot modify immutable field`. That difference would let a participant
 * confirm a private score by trying each possible value. Without the flag
 * every write is answered `UPDATE DENIED` (tests/rbac.spec.ts).
 */
export const CLOSED = everyRole({ read: false, create: false, update: false, delete: false })
