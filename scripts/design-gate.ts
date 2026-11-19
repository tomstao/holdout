/**
 * DeepSpace design gate: the checks from "Product polish" and the landing
 * "Anti-AI gate" that ESLint cannot express.
 *   https://docs.deep.space/design/product-polish.md#verify-with-a-smoke-test
 *   https://docs.deep.space/design/anti-ai-gate.md
 * ESLint already blocks browser dialogs, raw <select>, hardcoded colours and
 * emoji in TSX; this script checks the theme, the home declaration and the
 * landing page copy.
 *
 * Run: npm run design:gate (Node 22.18+ runs this TypeScript directly).
 * It is expected to fail until the design phase is done (docs/plan.md, day 4);
 * after that it joins `npm run check`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

interface Hit {
  rule: string
  where: string
}

const root = process.cwd()
const hits: Hit[] = []

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function scan(files: string[], pattern: RegExp, rule: string): void {
  for (const file of files) {
    read(file)
      .split('\n')
      .forEach((line, index) => {
        if (pattern.test(line)) {
          hits.push({
            rule,
            where: `${relative(root, file)}:${index + 1}  ${line.trim().slice(0, 100)}`,
          })
        }
      })
  }
}

function expect(condition: boolean, rule: string, where: string): void {
  if (!condition) hits.push({ rule, where })
}

const sourceFiles = walk('src').filter(
  (file) => /\.(tsx?|css)$/.test(file) && !file.endsWith('router.ts'),
)
const landingFiles = [
  join('src', 'pages', 'index.tsx'),
  ...walk(join('src', 'components', 'landing')),
].filter((file) => existsSync(file))

// Product polish, half 1: absence.
scan(sourceFiles, /placeholder page|Your app goes here/i, 'placeholder copy left in the app')
const indexHtml = read('index.html')
expect(!/<title>[^<]*DeepSpace/i.test(indexHtml), 'default page title', 'index.html <title>')

// The active theme must be the product's own: not a scaffold preset (or the
// `my-id` example in themes.css), and defined in src/themes.css.
const SCAFFOLD_THEMES = new Set(['slate', 'paper', 'my-id'])
const activeTheme = /data-theme="([\w-]+)"/.exec(indexHtml)?.[1] ?? ''
expect(
  activeTheme !== '' && !SCAFFOLD_THEMES.has(activeTheme),
  'scaffold theme still active',
  `index.html data-theme="${activeTheme}"`,
)

// Product polish, half 2: presence.
const home = read(join('src', 'pages', '(app)', 'home.tsx'))
expect(
  (home.split('\n')[0] ?? '').includes('home pattern:'),
  'home skeleton not declared on the first line',
  'src/pages/(app)/home.tsx',
)
expect(
  activeTheme !== '' && read(join('src', 'themes.css')).includes(`[data-theme="${activeTheme}"]`),
  'active theme has no block in src/themes.css',
  `[data-theme="${activeTheme}"]`,
)

// Landing anti-AI gate.
const landing = read(join('src', 'pages', 'index.tsx'))
expect(landing.includes('Design Direction'), 'no Design Direction block', 'src/pages/index.tsx')
scan(landingFiles, /(bg|text|border)-foreground\/(\[|\d)/, 'fractional-opacity foreground')
scan(
  landingFiles,
  /My App|Welcome to [Mm]y|[Ll]orem [Ii]psum|Your DeepSpace app is running/,
  'template copy',
)
scan(
  landingFiles,
  /streamline your|transform your|cutting.edge|state.of.the.art|next.generation|revolutionary|world.class|best.in.class|game.chang/i,
  'generic marketing phrase',
)
scan(landingFiles, /TODO[: ]/, 'unfilled TODO')

if (hits.length === 0) {
  console.log('design gate: clean')
} else {
  console.log(`design gate: ${hits.length} problem(s)\n`)
  for (const hit of hits) console.log(`  ${hit.rule}\n    ${hit.where}`)
  process.exitCode = 1
}
