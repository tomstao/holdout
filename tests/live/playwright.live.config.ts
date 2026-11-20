import { defineConfig } from '@playwright/test'

/**
 * The acceptance walk-through against the deployed app (docs/spec.md, "Acceptance
 * criteria for v1"). Not part of `npx deepspace test run`: it has no local server, it
 * leaves one competition on the live site for good, and its second half waits an hour.
 *
 *   npx playwright test -c tests/live/playwright.live.config.ts -g "walk"
 *   npx playwright test -c tests/live/playwright.live.config.ts -g "close"
 *
 * Run it only when the owner asks. docs/testing.md says what it leaves behind.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'acceptance.live.ts',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  outputDir: '../../test-results/live',
  use: {
    baseURL: process.env.HOLDOUT_LIVE_URL ?? 'https://holdout.app.space',
    headless: true,
  },
})
