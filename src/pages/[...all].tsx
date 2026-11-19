import { Link } from 'react-router-dom'
import { APP_NAME } from '../constants'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <title>{`Not found · ${APP_NAME}`}</title>
      <meta name="robots" content="noindex" />
      <h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>
      <p className="mb-6 text-muted-foreground">Page not found</p>
      <Link
        to="/home"
        className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Go home
      </Link>
    </div>
  )
}
