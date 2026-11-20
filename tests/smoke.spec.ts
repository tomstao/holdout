import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

/**
 * Smoke tests covering both page kinds this template ships:
 *   - '/'      → the static landing (top level of src/pages/): no providers,
 *                so no auth fetch and no records WebSocket on load.
 *   - '/home'  → a dynamic page (under src/pages/(app)/): the providers mount,
 *                the nav shell renders, and the records WebSocket connects.
 *
 * The "static contract" test is the guardrail for the per-page opt-out: if
 * someone moves the providers back up into _app.tsx, it fails.
 */

/** Wait for the React app shell (present on every page). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('static landing loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByTestId('static-landing')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('landing carries one title, one description, one canonical', async ({ page }) => {
    // <Seo> (src/pages/index.tsx, values from src/seo.ts) hoists these into
    // <head>. Exactly one of each: index.html ships no static description or
    // canonical, because React 19 would not dedupe against them on mount.
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await expect(page).toHaveTitle(/^Holdout \| /)
    expect(await page.locator('head meta[name="description"]').count()).toBe(1)
    expect(await page.locator('head link[rel="canonical"]').count()).toBe(1)
  })

  test('the landing is the designed page, within the design rules', async ({ page }) => {
    await page.goto('/')
    const headline = page.getByRole('heading', { level: 1 })
    await expect(headline).toHaveText('Your public score is not your grade.')
    await expect(page.getByText(/static front door|placeholder/i)).toHaveCount(0)
    // The hero's visual is the code-built leaderboard, not an image.
    await expect(page.getByRole('img', { name: /example leaderboard/i })).toBeVisible()
    await expect(page.locator('img')).toHaveCount(0)

    // DeepSpace's hard rules 1 and 2: a headline of 3 to 8 words, under 150 words of copy.
    const count = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
    const words = count(await headline.innerText())
    expect(words).toBeGreaterThanOrEqual(3)
    expect(words).toBeLessThanOrEqual(8)
    const copy = await page.locator('main p:not(figure p), main ol li, footer p').allInnerTexts()
    expect(copy.length).toBeGreaterThan(5)
    expect(count(copy.join(' '))).toBeLessThan(150)

    // The first button goes to the demo competition where there is one: in the live room,
    // so in a production build only (src/demo.ts). This server has none and keeps the
    // list. Either way the label has to agree with where the button leads.
    const cta = page.getByTestId('landing-cta')
    const target = await cta.getAttribute('href')
    if (target === '/home') {
      await expect(cta).toHaveText('See the competitions')
      await cta.click()
      await expect(page).toHaveURL(/\/home$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Competitions' })).toBeVisible({
        timeout: 15000,
      })
    } else {
      await expect(cta).toHaveText('Try the demo competition')
      expect(target).toMatch(/^\/c\/[0-9a-f-]{36}$/)
      await cta.click()
      await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/)
      await expect(page.getByTestId('competition-title')).toBeVisible({ timeout: 15000 })
    }
  })

  test('the landing leaderboard moves, and stays still when asked to', async ({ page }) => {
    await page.goto('/')
    const row = page.locator('.board-row').first()
    await expect(row).toHaveCSS('animation-name', 'board-row')
    await expect(page.locator('.board-seal')).toHaveCSS('animation-name', 'board-seal')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(row).toHaveCSS('animation-name', 'none')
    await expect(page.locator('.board-seal')).toHaveCSS('animation-name', 'none')
    // Still, the board shows what it shows before the deadline.
    await expect(page.locator('.board-final')).toHaveCSS('opacity', '0')
  })

  test('static contract: landing fires no auth request, opens no websocket', async ({ page }) => {
    const offenders: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/')) offenders.push(req.url())
    })
    // Only the DO room route counts — vite's own HMR socket is a dev artifact.
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/')) offenders.push(`ws: ${ws.url()}`)
    })
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await page.waitForTimeout(1500)
    expect(offenders).toEqual([])
  })

  test('dynamic app boundary mounts on /home', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 15000 })
  })

  test('the home page is the competition list, not the scaffold placeholder', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByRole('heading', { level: 1, name: 'Competitions' })).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByText(/placeholder page/i)).toHaveCount(0)
    // A visitor is asked to sign in once below the bar: by the band above the list, or by
    // the empty state when nothing is running. Either opens the sign-in overlay.
    const prompt = page.getByTestId('sign-in-prompt').or(page.getByTestId('no-open-competitions'))
    await expect(prompt).toHaveCount(1)
    await prompt.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByTestId('auth-overlay')).toBeVisible()
  })

  test('sign-in button visible when logged out', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('nav-user-name')).toHaveCount(0)
  })

  test('the app paints in the Holdout theme with its own fonts', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveTitle('Competitions · Holdout')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'holdout')
    // --color-background and --font-sans of [data-theme='holdout'] (src/themes.css).
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 241, 232)')
    await expect(page.locator('body')).toHaveCSS('font-family', /IBM Plex Sans/)
    // The font files are served by the app and load (docs/decisions/0015).
    const loaded = await page.evaluate(
      `document.fonts.load('14px "IBM Plex Sans"').then((faces) => faces.length)`,
    )
    expect(loaded).toBeGreaterThan(0)
    await expect(page.getByTestId('app-navigation').getByRole('link')).toHaveText([
      'holdout',
      'Competitions',
      'Host a competition',
    ])
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
  })
})
