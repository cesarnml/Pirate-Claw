# TDD Workflow For This Repo

This repo should use red-green-refactor, not horizontal slicing.

## Working Rules

- test behavior through public interfaces
- prefer integration-style tests
- mock only system boundaries
- write one failing test at a time
- write the minimum code to pass
- refactor only after green

## Public Interfaces To Test

The main public interfaces for phase 01 are:

- CLI commands
- feed fetch + parse entrypoint
- matcher entrypoints
- SQLite-backed repository behavior
- Transmission adapter

Avoid tests that assert:

- private helper behavior
- internal call counts
- module-to-module implementation detail

## Boundary Fakes Allowed

Use fakes or local test servers only at these boundaries:

- HTTP feed source
- Transmission RPC server
- SQLite test database
- time if run timestamps matter

Do not mock:

- internal matcher modules
- internal normalization helpers
- internal orchestration functions

## Red-Green-Refactor Pattern

For each ticket:

1. Write one failing test against a public behavior.
2. Implement the smallest code needed to make it pass.
3. Refactor for readability only after the test is green.
4. Stop and review before taking the next behavior slice.

## Example Ticket Rhythm

Good sequence:

1. CLI can load config.
2. CLI rejects invalid config.
3. RSS fetch returns parsed items.
4. Title normalization extracts TV fields.
5. TV matcher accepts intended release.

Bad sequence:

- add all modules first
- add database later
- add tests after the entire feature works

## Definition Of Done

A ticket is done when:

- its new public behavior is covered by tests
- tests are green
- code only includes the minimum support needed for that behavior
- README or docs changes needed for that slice are included
- a short rationale note explains why this was the smallest acceptable path
- unresolved follow-up work is captured in the next ticket, not hidden in comments

## Suggested Test Split

Keep the suite small and behavior-focused:

- integration tests for CLI and end-to-end pipeline
- focused tests for normalization and matching behavior
- adapter tests for Transmission handshake and failure paths

## Bun Portability Notes

- prefer Bun-native APIs when they are stable and sufficient for the test
- use Bun's Node-compat modules for path, fs, and os portability when they produce simpler cross-platform code
- do not assume browser-style globals such as `DOMParser` exist in every Bun runtime context
- avoid shelling out to platform-specific tools like BSD `mktemp` in tests
- prefer path-aware helpers over manual string slicing for executable paths and `PATH` updates
- run full `verify` and `test`, not just `typecheck`, before considering a ticket green

## Learning-Oriented Review Prompts

After each ticket, review with these questions:

- what behavior went red first
- what code was the minimum to go green
- why was this the smallest acceptable implementation
- what alternative was considered and why was it rejected
- what refactor improved clarity without changing behavior
- what did we intentionally not build yet

## Suggested Rationale Template

Use this short template in PRs, ticket updates, or review notes:

- `Red first:` ...
- `Why this path:` ...
- `Alternative considered:` ...
- `Deferred:` ...
