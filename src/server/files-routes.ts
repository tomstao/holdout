/**
 * `GET /api/competitions/:id/files/:kind`: a competition's train file, test
 * file or sample submission, for anyone, signed in or not.
 *
 * The files live in the host's private folder, where no other member can
 * replace them; this route is the only way out
 * (docs/decisions/0011-datasets-in-host-files-behind-a-route.md). It serves
 * exactly the three keys stored on the competition record, never a key from
 * the request.
 */
import type { Hono } from 'hono'
import { appFiles, AppFileError } from 'deepspace/worker'
import { typedRecords } from '../actions/records.js'
import type { AppContext } from '../../worker.js'
import { roomTools } from './room-tools.js'

const DOWNLOAD_NAMES = {
  train: 'train.csv',
  test: 'test.csv',
  sample: 'sample_submission.csv',
} as const

type FileKind = keyof typeof DOWNLOAD_NAMES

function isFileKind(value: string): value is FileKind {
  return Object.hasOwn(DOWNLOAD_NAMES, value)
}

export function registerFilesRoutes(app: Hono<AppContext>): void {
  app.get('/api/competitions/:id/files/:kind', async (c) => {
    const kind = c.req.param('kind')
    if (!isFileKind(kind)) return c.json({ error: 'not_found' }, 404)
    const found = await typedRecords(roomTools(c.env)).get('competitions', c.req.param('id'))
    if (!found.success) return c.json({ error: 'not_found' }, 404)
    const competition = found.data.record.data

    try {
      const file = await appFiles(c.env, { scope: 'self', userId: competition.hostId }).download(
        competition.files[kind].key,
      )
      const headers = new Headers({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${DOWNLOAD_NAMES[kind]}"`,
        // A competition's files do not change, but a short lifetime keeps a mistake short.
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      })
      const length = file.headers.get('content-length')
      if (length) headers.set('Content-Length', length)
      return new Response(file.body, { headers })
    } catch (error) {
      if (error instanceof AppFileError && error.status === 404) {
        return c.json({ error: 'not_found' }, 404)
      }
      throw error
    }
  })
}
