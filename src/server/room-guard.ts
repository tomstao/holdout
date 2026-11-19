/**
 * Which WebSocket frames the app's record room refuses before the SDK reads
 * them.
 *
 * The SDK gives every record room a built-in collection, `canvas-settings`,
 * that any role, signed out included, may create, update and delete rows in
 * (`SYSTEM_COLLECTIONS` in deepspace/worker). This app has no canvas, and its
 * rule is that no client writes to the room. A frame that names a built-in
 * collection is therefore refused: a put, a delete, a subscription or a Yjs
 * join. Binary frames belong to a Yjs document that was joined first, so
 * refusing the join covers them.
 */

/** A frame as far as this check reads it. Anything may be missing or of another type. */
interface Frame {
  payload?: { collection?: unknown; query?: { collection?: unknown } | null } | null
}

/** True when `message` is a JSON frame about one of `collections`. */
export function namesCollection(message: string, collections: ReadonlySet<string>): boolean {
  let frame: Frame | null
  try {
    frame = JSON.parse(message) as Frame | null
  } catch {
    // Not JSON: the room answers that itself.
    return false
  }
  if (typeof frame !== 'object' || frame === null) return false
  const payload = frame.payload
  if (typeof payload !== 'object' || payload === null) return false
  const named = [payload.collection, payload.query?.collection]
  return named.some((name) => typeof name === 'string' && collections.has(name))
}
