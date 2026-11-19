# 0014. Ship from GitHub source

**Status:** Proposed, 2026-11-19. **The owner decides** before the first deploy; it cannot
be changed afterwards.

## Context

A DeepSpace app has exactly one source authority, latched permanently by its first
source-producing action
([official skill](../../.claude/skills/deepspace/SKILL.md#one-source-authority)):

- **DeepSpace source:** the platform's cloud repo; `deepspace push`, commit-first
  deploys. Latched by the first `deepspace push`, or by a deploy from a checkout with no
  GitHub remote.
- **GitHub source:** a deploy from a checkout whose selected remote is GitHub claims that
  repository. Deploys ship the local working tree, including uncommitted bytes.

The submission portal asks for "the repository", which reviewers will open on GitHub.

## Proposal

GitHub source:

1. Create the GitHub repository and add it as `origin` **before the first deploy**.
2. Check `npx deepspace status --json` shows GitHub as the inferred source.
3. Never run `deepspace push`.
4. Deploy from a clean, pushed `main`, because deploys ship the working tree as it is.

## Consequences

- One source of truth, reviewers read it directly, and CI runs there.
- Releases record no DeepSpace commit lineage; `git` tags mark what was deployed.
- If the app ever latches DeepSpace source by mistake, the only way back is a new app id
  (`app init --new-id`), which leaves the old app's data behind.
