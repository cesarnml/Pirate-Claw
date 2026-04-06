# E3.03 Planning And State Core Extraction

Separate plan/state mechanics from command orchestration.

## Deliverable

- move config loading and resolution into `config/`
- move plan parsing, plan-key derivation, and plan discovery into `planning/`
- move state load/save/sync/repair and repo-state inference into `state/`

## Acceptance

- command handlers consume planning/state services instead of re-deriving repo facts inline
- state file shape and inferred-status semantics remain unchanged
- plan discovery and branch inference continue to behave as they do today

## Explicit Deferrals

- no review-lifecycle extraction in this ticket
- no PR-metadata extraction in this ticket
- no workflow-semantic changes
