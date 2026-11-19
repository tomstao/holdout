import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { appIdDefine } from 'deepspace/build'

const appDir = fileURLToPath(new URL('.', import.meta.url))

// Vitest only. Playwright specs in tests/*.spec.ts run through `deepspace test run`.
//
// Two projects:
//   pure  Domain logic, contracts and the typed action layer. No platform
//         identity needed, so these run anywhere, including before the app is
//         registered and in CI.
//   app   Tests that import src/constants.ts, which needs the app id the build
//         injects from wrangler.toml (the scaffold's prerender tests). Skipped,
//         with a warning, until `npx deepspace app init` has written the id.
const PURE_TESTS = [
  'src/domain/**/*.test.ts',
  'src/contracts/**/*.test.ts',
  'src/actions/**/*.test.ts',
  'src/server/**/*.test.ts',
  'src/client/**/*.test.ts',
  'scripts/**/*.test.ts',
]

function appIdOrNull(): Record<string, string> | null {
  try {
    return appIdDefine({ appDir })
  } catch {
    console.warn(
      '[vitest] Skipping the "app" project: wrangler.toml has no app id yet. Run `npx deepspace app init`.',
    )
    return null
  }
}

const appDefine = appIdOrNull()
const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'pure', include: PURE_TESTS, environment: 'node' },
      },
      ...(appDefine
        ? [
            {
              extends: true as const,
              define: appDefine,
              test: {
                name: 'app',
                include: ['prerender.test.ts', 'src/**/*.test.{ts,tsx}'],
                exclude: PURE_TESTS,
                environment: 'node',
              },
            },
          ]
        : []),
    ],
    coverage: {
      provider: 'v8',
      // The logic that decides scores and access is held to a high bar.
      include: ['src/domain/**/*.ts', 'src/contracts/**/*.ts', 'src/actions/implement.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
})
