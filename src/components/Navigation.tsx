/**
 * The app's top bar: the wordmark, the links from src/nav.ts, and either a
 * sign-in button or the account menu.
 *
 * The test ids are a contract with the specs and the DeepSpace test tooling:
 * `app-navigation`, `nav-sign-in-button`, `nav-user-name`, `nav-user-email`.
 * `nav-user-email` is the one a test can check exactly: the email is what the
 * session was opened with.
 */
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthOverlay, signOut, useAuthProfileReady } from 'deepspace'
import { ChevronDownIcon, LogOutIcon, MenuIcon, SettingsIcon, XIcon } from 'lucide-react'
import type { Role } from '../constants'
import { cn } from '../lib/utils'
import { nav, type NavItem } from '../nav'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui'
import { Wordmark } from './Wordmark'

function isActive(item: NavItem, pathname: string): boolean {
  return [item.path, ...(item.also ?? [])].some((prefix) => pathname.startsWith(prefix))
}

export default function Navigation() {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)

  const profileReady = !isSignedIn || (!userLoading && user !== null)
  const role = user?.role ?? 'anonymous'
  const links = nav.filter((item) => {
    if (item.devOnly && !import.meta.env.DEV) return false
    if (!item.roles) return true
    if (!profileReady) return false
    return role === 'admin' || item.roles.includes(role as Role)
  })

  return (
    <>
      <nav
        data-testid="app-navigation"
        aria-label="Main"
        className="border-b border-border bg-background"
      >
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-6 px-6">
          <Link to="/home" aria-label="Holdout home" className="rounded-sm">
            <Wordmark />
          </Link>

          <div className="hidden h-full items-stretch gap-5 md:flex">
            {links.map((item) => {
              const active = isActive(item, pathname)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center border-b-2 pt-0.5 text-sm transition-colors',
                    active
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>

          <div className="flex-1" />

          {!isLoaded ? null : isSignedIn && !user ? (
            // Signed in, profile still loading: a placeholder, never the Sign in
            // button, which would offer sign-in to someone who is signed in.
            <div
              aria-busy="true"
              className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-1.5"
            >
              <div className="size-6 animate-pulse rounded-full bg-muted" />
              <div className="hidden h-4 w-20 animate-pulse rounded-sm bg-muted sm:block" />
            </div>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Account menu"
                    className="group flex h-9 items-center gap-2 rounded-md border border-border bg-card pr-2 pl-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <Avatar className="size-6">
                      <AvatarImage src={user.imageUrl} referrerPolicy="no-referrer" />
                      <AvatarFallback className="text-[11px]">
                        {(user.name || user.email).slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      data-testid="nav-user-name"
                      className="hidden max-w-36 truncate text-foreground sm:inline"
                    >
                      {user.name || user.email}
                    </span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground transition-transform duration-150 group-data-[popup-open]:rotate-180"
                    />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="truncate font-medium text-foreground">
                    {user.name || 'Signed in'}
                  </div>
                  <div
                    data-testid="nav-user-email"
                    className="truncate text-xs font-normal text-muted-foreground"
                  >
                    {user.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void navigate('/settings')}>
                  <SettingsIcon aria-hidden="true" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOutIcon aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              data-testid="nav-sign-in-button"
              onClick={() => {
                setShowSignIn(true)
              }}
            >
              Sign in
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-9 md:hidden"
            aria-label={menuOpen ? 'Close the menu' : 'Open the menu'}
            aria-expanded={menuOpen}
            aria-controls="nav-links"
            onClick={() => {
              setMenuOpen((open) => !open)
            }}
          >
            {menuOpen ? <XIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
          </Button>
        </div>

        {menuOpen && (
          <div id="nav-links" className="flex flex-col border-t border-border px-6 py-2 md:hidden">
            {links.map((item) => {
              const active = isActive(item, pathname)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'py-2 text-sm',
                    active ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                  onClick={() => {
                    setMenuOpen(false)
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {showSignIn && (
        <AuthOverlay
          onClose={() => {
            setShowSignIn(false)
          }}
        />
      )}
    </>
  )
}
