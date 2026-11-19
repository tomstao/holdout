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
 */
export const CLOSED = everyRole({ read: false, create: false, update: false, delete: false })
