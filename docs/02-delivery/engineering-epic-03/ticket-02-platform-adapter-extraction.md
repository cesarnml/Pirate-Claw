# E3.02 Platform Adapter Extraction

Extract process and repo-integration seams behind a platform boundary.

## Deliverable

- move process execution and command-failure formatting behind `platform/`
- move git and GitHub CLI helpers behind `platform/`
- move worktree discovery, branch/head reads, clean-worktree checks, and bootstrap/env-copy helpers behind `platform/`

## Acceptance

- higher-level orchestrator logic stops scattering raw git/GitHub command execution
- behavior remains unchanged from the operator's perspective
- no branch/worktree strategy redesign is introduced

## Explicit Deferrals

- no planning/state extraction in this ticket
- no review-lifecycle extraction in this ticket
- no PR-metadata redesign
