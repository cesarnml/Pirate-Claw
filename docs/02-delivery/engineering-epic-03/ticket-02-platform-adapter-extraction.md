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

## Rationale

This ticket moves process execution, git and GitHub CLI interactions, worktree discovery, and bootstrap helpers behind a dedicated `platform/` boundary so later tickets can extract planning, review, and PR-metadata concerns without dragging shell orchestration details through each refactor.

The extraction is intentionally mechanical. It keeps the existing branch strategy, worktree layout, command surface, and PR semantics intact while removing the orchestrator's direct dependence on scattered raw `git` and `gh` command construction.
