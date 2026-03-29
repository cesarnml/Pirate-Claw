# ADR-001: Use Bun For Phase 01

## Status

Accepted

## Context

Pirate Claw is a local CLI with a narrow runtime surface:

- command-line execution
- HTTP feed fetching
- SQLite persistence
- Transmission RPC integration
- behavior-first tests

The repo is intentionally optimized for small, reviewable slices. The runtime choice should be explicit so Ticket 01 does not reopen it.

## Decision

Use Bun + TypeScript as the default runtime and test environment for phase 01.

Prefer Bun's integrated runtime, package manager, test runner, and native SQLite support unless a later ticket exposes a concrete reason to deviate.

## Consequences

Positive:

- smaller initial toolchain surface
- native SQLite support fits the local CLI use case
- fast CLI and test startup
- fewer moving parts in early slices

Tradeoffs:

- narrower ecosystem compatibility than Node
- some debugging paths may require Bun-specific knowledge
- if a dependency behaves differently under Bun, the repo must treat that as a real integration constraint

## Follow-Up

- keep Bun setup minimal in Ticket 01
- document any Bun-specific friction as later ADRs or ticket notes
