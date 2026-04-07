# E3.05 PR Metadata And Reviewer-Facing Rendering Extraction

Move reviewer-facing markdown and PR metadata updates into their own module boundary.

## Deliverable

- move PR title generation into `pr-metadata/`
- move PR-body builders, metadata refresh adapters, markdown guards, AI-review rendering, and standalone managed-section merging into `pr-metadata/`

## Acceptance

- all reviewer-facing markdown generation lives behind one isolated module boundary
- ticketed and standalone flows preserve their existing body-ownership rules
- reviewer-facing semantics remain equivalent where the current behavior is intentionally shared

## Explicit Deferrals

- no command-handler rewrite in this ticket
- no workflow or PR-ownership redesign

## Rationale

- Added `tools/delivery/pr-metadata.ts` as the isolated reviewer-facing boundary for PR title generation, PR body rendering, markdown guards, AI review section rendering, managed standalone AI review sections, and PR metadata refresh adapters.
- Rewired the orchestrator to consume that module through thin delegates so reviewer-facing copy and PR body ownership rules no longer live inside the command/orchestration layer.
- Preserved the current ticketed and standalone semantics by carrying forward the existing markdown stripping rules, AI review rendering behavior, and PR refresh behavior behind the new module boundary rather than redesigning the workflow in this ticket.
