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
