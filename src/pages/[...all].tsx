import { Link } from 'react-router-dom'
import { BRAND } from '../constants'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <title>{`Not found · ${BRAND}`}</title>
      <meta name="robots" content="noindex" />
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">This page does not exist.</h1>
      <Link
        to="/home"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        See the competitions
      </Link>
    </div>
  )
}
