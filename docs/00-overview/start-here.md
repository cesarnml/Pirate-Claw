# Start Here

This repo is currently documentation-first. There is no implementation yet.

If you are a new Codex thread, get your bearings in this order:

1. Read `docs/01-product/phase-01-mvp.md`.
2. Read `docs/02-delivery/phase-01/implementation-plan.md`.
3. Read `docs/03-engineering/tdd-workflow.md`.

## What This Project Is

A local CLI that:

- reads configured RSS feeds
- normalizes titles into media metadata
- matches items against JSON rules for TV and movies
- deduplicates with SQLite
- submits approved candidates to Transmission
- records outcomes for review and retry

Phase 01 ends at successful queueing in Transmission.

## What This Project Is Not Yet

Do not build these in the first implementation slice:

- web UI
- scheduling
- download completion polling
- renaming
- Synology archiving
- source-specific hardcoding

## How To Work

Follow red-green-refactor.

- one ticket at a time
- one failing test at a time
- one review stop after each ticket

Do not implement all of phase 01 in one go.

## First Ticket To Implement

Start with `P1.01 CLI Skeleton And Config Loading` from `docs/02-delivery/phase-01/ticket-01-cli-skeleton-and-config-loading.md`.

The first slice should decide only what is necessary to support that ticket:

- minimal Bun project setup
- Bun test runner
- minimal file layout
- runnable CLI entrypoint
- config loading and validation behavior

Do not pre-build modules for later tickets unless the first failing test requires them.

## Expectations For The Next Thread

The next Codex thread should:

1. confirm the docs-driven plan
2. implement only Ticket 01
3. explain the first failing test before writing code
4. include a short rationale for why the chosen implementation was the smallest acceptable path
5. stop after Ticket 01 for review

## Explanation Requirement

Every ticket handoff should leave a short explanation artifact in the PR, review notes, or ticket update that answers:

- what behavior went red first
- why the chosen implementation was the smallest acceptable path
- what alternative was considered and rejected
- what was intentionally deferred

## If Something Feels Ambiguous

Default to the smallest implementation that preserves these constraints:

- Bun + TypeScript
- SQLite for persistence
- Transmission as the first downloader adapter
- source-agnostic core
- behavior-focused tests through public interfaces
