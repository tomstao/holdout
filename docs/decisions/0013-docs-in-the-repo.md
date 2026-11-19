# 0013. Keep the planning documents in the repository

**Status:** Accepted, 2026-11-19

## Context

DeepSpace's "Building an app" guide advises keeping planning and coordination documents
out of the repository ("gitignore the docs folder"). This repository is also the
submission for an evaluation that looks at scope, judgment, trade-offs and how the coding
agent was directed and checked.

## Decision

Commit `docs/`: research, spec, architecture, design, decisions, plan, testing, lessons
and the submission notes. Keep them current in the same pull request as the change they
describe.

## Consequences

- Reviewers and later agents read the reasoning next to the code.
- Agent scratch work (transcripts, temporary research files) stays out of the repository.
