# EE10 Retrospective — Delivery Tooling Module Decomposition

## What Held As Designed

Every module boundary in the original epic design held through implementation
without structural renegotiation.

- `types.ts` (EE10.01) — Clean extraction. All shared types lived together in
  `orchestrator.ts` with no split ownership. Moving them first made every
  subsequent ticket's import story trivial.
- `env.ts` (EE10.02) — `parseDotEnv` and its one helper had zero entanglement
  with other concerns. Extracted in one move, no surprises.
- `runtime-config.ts` (EE10.03) — The `_config` singleton and
  `OrchestratorConfig` loading logic belonged together. The live-binding
  semantics of `export let _config` worked correctly through the barrel without
  any special handling.
- `format.ts` (EE10.04) — Pure formatting functions. No state dependencies.
  Extracted without incident.
- `platform-adapters.ts` (EE10.05) — The largest ticket. The design correctly
  anticipated that platform wrappers, naming utilities, and artifact helpers
  were three distinct clusters. Each cluster landed in its designed module
  (`platform-adapters.ts`, `planning.ts`, `ticket-flow.ts`) without
  reassignment.
- `cli-runner.ts` (EE10.06) — The CLI dispatch switch and its private helpers
  moved cleanly. The barrel reduction to pure re-exports was mechanical once
  the prior tickets were in place.

## Ownership Ambiguities That Surfaced

**`parsePullRequestNumber`** — Originally placed as a private helper in
`platform-adapters.ts`. Used only by `openPullRequest` in `cli-runner.ts`. The
function's concern is parsing a string from a platform API response — it could
reasonably sit in either module. It stayed private in `platform-adapters.ts`
because that is where its only caller's dependency was created. EE11 can
revisit once the context-object shape is known.

**`formatError`** — A private one-liner in `cli-runner.ts`. It wraps caught
values into strings for the CLI dispatch catch block. It has no callers outside
that catch block. Its placement is correct but its triviality makes it a
candidate for inlining. Left as-is to keep EE10 scope pure.

**`materializeTicketContext`** — Was added to `ticket-flow.ts` in EE10.05 as
part of the artifact-helper cluster. The function's responsibility (copying
bounded delivery artifacts into a started worktree) is genuinely ticket-flow
work, so the placement is correct. It appeared ambiguous during EE10.05 because
it touches filesystem paths that overlap with platform concerns, but the
distinction is that it operates on delivery state and handoff artifacts, not on
platform primitives.

## Test Migration Lessons

**EE8.01 and EE8.02 moved cleanly from `orchestrator.test.ts` to
`ticket-flow.test.ts`.** The describe blocks tested `recordPostVerifySelfAudit`,
`recordCodexPreflight`, and `shouldAutoRecordReviewSkippedForPollReview` — all
of which now live in `cli-runner.ts`. The blocks were migrated verbatim and
only import paths changed.

**Import consolidation in `orchestrator.test.ts` was mechanical but verbose.**
After EE10.01–EE10.06, the test file's single large barrel import block became
thirteen focused source-module import blocks. No test logic changed. The
resulting import section is longer by line count but each import is now
traceable to a single-concern module, which makes future test relocations
obvious.

**`closeout-stack.test.ts` and `review.test.ts` required no import changes.**
They already imported from source modules or from modules that did not move.

**The only judgment call in test migration** was determining which describe
blocks in `orchestrator.test.ts` qualified as integration smoke tests (retain)
versus unit tests (migrate). The rule applied: blocks that exercise the full
`runDeliveryOrchestrator` dispatch path are integration tests; blocks that
exercise a single exported function in isolation are unit tests and belong in
the source module's test file.

## EE11 Follow-Up Items

These items were deferred from EE10 to keep the refactor pure. EE10 is a
structural decomposition — zero behavior change. EE11 is an architectural
improvement that builds on the new module boundaries.

- **Replace `_config` module singleton with explicit context object.** The
  `export let _config` pattern in `runtime-config.ts` works but couples all
  callers to a shared mutable singleton. EE11 should introduce an explicit
  context object passed through the call stack, eliminating `initOrchestratorConfig`
  test boilerplate and making unit tests self-contained.

- **Eliminate `initOrchestratorConfig` test boilerplate.** Every test that
  exercises a function depending on `_config` must call `initOrchestratorConfig`
  before the assertion. Once the context object lands, test setup becomes
  constructing a value, not mutating global state.

- **Revisit `formatError` placement.** Currently private in `cli-runner.ts`.
  Trivial enough to inline; or promote to a utility if a second caller emerges.
  Not worth extracting in isolation before EE11 shapes the context object.

- **Revisit `parsePullRequestNumber` placement.** Currently private in
  `platform-adapters.ts`. Its concern is string parsing, not platform I/O.
  Once EE11 designs the platform adapter factory pattern, the right home for
  this helper will be clearer.

- **Design platform adapter factory pattern.** EE10 gave each platform-adapter
  wrapper explicit `_config.runtime` injection. EE11 can formalize this into an
  adapter factory keyed on the context object's runtime field, eliminating the
  per-call `_config` reads and making the adapters independently testable.
