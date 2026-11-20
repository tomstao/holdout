/**
 * The demo competition, and where the landing's first button goes.
 *
 * "Palmer Penguins (practice)" was created by hand at /host/new on the live site
 * (docs/plan.md, PR 13b), so its record is in the production room and nowhere else.
 * Only a production build points at it. `deepspace dev`, the Playwright server and
 * Vitest have no such competition, get no id, and keep the list as the target.
 *
 * The id is public: it is the page's address. It is source, not a `.env` file, because
 * DeepSpace treats every `.env*` file as a secret file.
 */

/** https://holdout.app.space/c/ff94aae4-8438-4ed6-a3c4-37bbd7850ca2 */
const LIVE_DEMO_COMPETITION_ID = 'ff94aae4-8438-4ed6-a3c4-37bbd7850ca2'

/** The demo's id where the demo exists; `undefined` everywhere else. */
export const DEMO_COMPETITION_ID: string | undefined = import.meta.env.PROD
  ? LIVE_DEMO_COMPETITION_ID
  : undefined

export interface CallToAction {
  label: string
  to: string
}

/** The landing's first button. The label never promises a demo the target lacks. */
export function landingCallToAction(demoId: string | undefined): CallToAction {
  if (demoId === undefined) return { label: 'See the competitions', to: '/home' }
  return { label: 'Try the demo competition', to: `/c/${demoId}` }
}
