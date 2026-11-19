// Layer rules for Holdout (docs/architecture.md, "Layers"). Run: npm run arch
//
//   domain     src/domain/**        pure TypeScript, imports nothing else in the app
//   contracts  src/contracts/**     wire contracts shared by both runtimes
//   schemas    src/schemas*         DeepSpace collection schemas (RBAC), shared
//   worker     worker.ts, src/{actions,server,ai}/**, src/{cron,jobs,integrations}.ts
//   browser    src/{pages,components,features,client,lib}/**, src/main.tsx
//
// ESLint bans the wrong *packages* per layer; this file bans the wrong
// *directories*, which needs resolved paths. Tests may cross layers.

const WORKER = '^(worker\\.ts$|src/(actions|server|ai)/|src/(cron|jobs|integrations)\\.ts$)'
const BROWSER = '^src/(pages|components|features|client|lib)/|^src/main\\.tsx$'
const TESTS = '\\.test\\.tsx?$'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Runtime import cycles. Type-only cycles (e.g. `import type { Env } from worker`) are allowed.',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'src/domain may import only src/domain (and npm packages ESLint allows).',
      from: { path: '^src/domain/', pathNot: TESTS },
      to: { path: '^src/', pathNot: '^src/domain/' },
    },
    {
      name: 'contracts-are-shared',
      severity: 'error',
      comment: 'Contracts are imported by both runtimes, so they may not import either one.',
      from: { path: '^src/contracts/', pathNot: TESTS },
      to: { path: `${WORKER}|${BROWSER}` },
    },
    {
      name: 'browser-not-to-worker',
      severity: 'error',
      comment: 'Browser code reaches the Worker only over HTTP: callAction() and the record hooks.',
      from: { path: BROWSER, pathNot: TESTS },
      to: { path: WORKER },
    },
    {
      name: 'worker-not-to-browser',
      severity: 'error',
      comment: 'Worker code must not import browser code.',
      from: { path: WORKER, pathNot: TESTS },
      to: { path: BROWSER },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: 'Production code must not import tests.',
      from: { pathNot: TESTS },
      to: { path: TESTS },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^src/router\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      exportsFields: ['exports'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
