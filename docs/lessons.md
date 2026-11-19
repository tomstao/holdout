# Lessons

Gotchas and wrong assumptions, written down the moment they are found so no session or
agent repeats them. Newest at the bottom. Each entry: what happened, what to do instead.

## 2026-11-19, setup

**DeepSpace platform**

- **The docs lag the SDK.** The docs are stamped 0.43.0; the installed SDK is 0.44.2.
  `tools.update` is a shallow merge (the old example apps say full replace), and
  `records.query` pages with `offset`/`nextOffset` (the docs say no pagination). Per the
  official skill, `node_modules/deepspace/dist/*.d.ts` and the CLI's `--help` win.
- **The live integration catalog beats the guides.** `email/send` always sends from
  `notifications@updates.app.space`; the guide's `<app>@app.space` is out of date. Check
  `npx deepspace integrations info <endpoint>` before relying on a guide's example.
- **The scaffold does not register the app, and committing first changes how you
  register.** With the `__APP_ID__` placeholder committed, first use no longer registers;
  run `npx deepspace app init`.
- **`vite build` and the scaffold's Vitest config refuse to load without a registered app
  id.** Unit tests that need no platform identity run in Vitest's `pure` project, so they
  work before registration and in CI.
- **Uploads to app files return 401 locally until the app has been deployed once.**
- **`app init` registers the id but does not claim the subdomain;** the first deploy
  does, so a taken name only shows up then. `app init` also suggests a commit message
  (`Register app_…`) that commitlint rejects; use a Conventional Commit.
- **`vite build` runs the type-aware ESLint through `vite-plugin-checker`** (about 9 of
  the build's 10 seconds); a lint error fails the build and so the deploy.
- **Members can trigger cron tasks, enqueue jobs and read job payloads and results by
  default.** Design every task and job to be safe when run early, and never put private
  data in a job row.
- **There is no atomic read-modify-write on records.** Use `uniqueOn` (refused duplicates)
  or derive state from insert-only rows; a JobRoom serialises its handlers.

**Tooling**

- **ESLint flat config globs are minimatch:** escape `[...all]` as `\\[...all\\]` and
  match the `(app)` route group with `?app?`.
- **The product-polish colour rule must allow `shadow-[...rgba()]`:** DeepSpace's theme
  docs prescribe literal shadows, and the scaffold's Dialog uses one.
- **typescript-eslint and `tsc` can disagree on an empty registry:** the linter calls
  an `as` assertion inside `Object.entries()` unnecessary, the compiler needs it.
  Annotate a variable (`const r: T = x`) instead of asserting.
- **Composite TypeScript projects refuse imports from outside the project (TS6307).** Code
  both runtimes need, such as the action client's wire protocol, lives in
  `src/contracts`.
- **dependency-cruiser 18 has no `extensionAlias` option;** the Worker's `.js`
  specifiers resolve to `.ts` through `tsConfig` anyway.
- **Lefthook's npm postinstall writes a commented example `lefthook.yml`** when none
  exists. Replace it; do not commit the example.

**This Windows machine**

- **`core.autocrlf=true` globally:** `.gitattributes` pins LF, or Prettier fails on every
  checkout.
- **Git Bash heredocs mangle backslashes and some quotes:** write files with an editor or
  a script file, not `cat <<EOF`, when the content has `\`.
- **The console code page is GBK:** run Python with `PYTHONUTF8=1`.
- **Git's global identity is a personal address:** this repository uses a repo-local
  `user.name`/`user.email` with the GitHub no-reply address.
