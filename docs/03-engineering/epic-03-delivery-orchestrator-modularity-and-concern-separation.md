# Epic 03: Delivery Orchestrator Modularity And Concern Separation

This engineering epic tracks the next maintainability step for the repo-local delivery orchestrator.

It is intentionally not a numbered Pirate Claw product phase. The target is delivery-tooling architecture, not new CLI or runtime behavior.

## Goal

Break the orchestrator into concern-first modules so the repo can keep evolving delivery tooling without concentrating every behavior in one file.

The current problem is structural, not feature scarcity. [`tools/delivery/orchestrator.ts`](../../tools/delivery/orchestrator.ts) now mixes CLI parsing, config resolution, plan/state loading, ticket progression, AI-review lifecycle logic, reviewer-facing PR metadata rendering, git/GitHub process execution, worktree bootstrap, and Telegram notifications in one file.

## Stance

This epic is a seam-first extraction, not a workflow rewrite.

Preserve:

- `bun run deliver --plan ...` command surface and command semantics
- delivery state under `.agents/delivery/<plan-key>/...`
- standalone AI-review storage under `.agents/ai-review/pr-<number>/...`
- current PR-body ownership rules:
  - ticketed flow owns the full generated body
  - standalone flow preserves author-owned content outside the managed AI-review section

Do not widen into:

- PR-creation redesign
- branch/worktree naming or bootstrap redesign
- `stacked-closeout` redesign
- storage-layout migration
- `ai-code-review` fetcher or triager contract redesign

## Target Decomposition

The recommended decomposition is concern-first with thin mode adapters:

- `core/`: shared types, outcome accumulation, small invariants, shared constants
- `config/`: orchestrator config loading and runtime/package-manager resolution
- `cli/`: argv parsing, usage text, top-level command dispatch
- `planning/`: plan parsing, plan-key derivation, implementation-plan discovery
- `state/`: load/save/sync/repair/infer-from-repo
- `ticket-flow/`: `start`, `internal-review`, `advance`, `restack`, handoff generation
- `review/`: fetcher/triager parsers, polling loop, artifact persistence, thread resolution, review result accumulation
- `pr-metadata/`: PR title/body builders, refresh adapters, reviewer-facing markdown guards
- `platform/`: process runner, git/GitHub wrappers, worktree/bootstrap helpers
- `notifications/`: notifier resolution, event building, Telegram delivery

## Module Ownership Rules

- `platform/` owns command execution and command-failure formatting. Higher layers should stop calling raw git/GitHub commands directly.
- `review/` owns polling, triage, artifact persistence, thread resolution, and cumulative outcome semantics. Ticketed and standalone flows should become thin adapters over the same review core.
- `pr-metadata/` owns reviewer-facing markdown generation and PR metadata refresh behavior.
- `state/` owns state loading, saving, syncing, repair, and repo-state inference.
- `ticket-flow/` owns ticket progression and handoff generation, but not review semantics or reviewer-facing markdown rendering.
- `tools/delivery/orchestrator.ts` remains the stable facade entrypoint and composition shell for `runDeliveryOrchestrator(argv, cwd)`.

## Why This Is One Epic

This remains one epic as long as it stays focused on extracting existing concerns behind stable boundaries.

If implementation starts reopening workflow semantics or inventing new delivery behavior, the work should split again instead of widening this epic.

## Delivery Shape

The runnable companion plan for this epic lives at:

- [`docs/02-delivery/engineering-epic-03/implementation-plan.md`](../02-delivery/engineering-epic-03/implementation-plan.md)

This epic should still follow the repo's normal planning control points:

- run an explicit planning pass
- use `grill-me` to pressure-test scope and decomposition
- require developer approval of the ticket stack before implementation

Plan Mode may be used as a conversational aid, but it is not a repo policy requirement.
