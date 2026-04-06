# Phase 07 Implementation Plan

Phase 07 improves operator-facing config ergonomics while preserving backward compatibility with the current config model.

## Epic

- `Phase 07 Config Ergonomics`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase. If scope still feels fuzzy, use `grill-me` before implementation.

## Ticket Order

1. `P7.01 Compact TV Config`
2. `P7.02 TV Per-Show Overrides`
3. `P7.03 Config Normalization Visibility`
4. `P7.04 Env-Backed Transmission Secrets`
5. `P7.05 Config Validation UX`

## Ticket Files

- `ticket-01-compact-tv-config.md`
- `ticket-02-tv-per-show-overrides.md`
- `ticket-03-config-normalization-visibility.md`
- `ticket-04-env-backed-transmission-secrets.md`
- `ticket-05-config-validation-ux.md`

## Exit Condition

Operators can express common TV tracking intent with `tv.defaults + tv.shows`, apply bounded per-show overrides where needed, inspect the fully-expanded effective config through the CLI, and source Transmission credentials from env vars or `.env` instead of the main JSON when desired.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket and rationale
- the phase-level defaults and deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 07:

- config mini-DSLs or named quality profiles
- broad ingestion redesign beyond the current config model
- non-Transmission secret providers
- orchestrator or `orchestrator.config.json` refactors
- delivery-tooling module decomposition

## Stop Conditions

Pause for review if:

- compact config support forces a breaking change to the existing `TvRule[]` input form
- config normalization visibility requires a broader CLI-output redesign beyond one bounded command
- env-backed secrets require external secret providers or platform-specific credential stores
- validation UX changes force a schema-layer rewrite rather than bounded improvements to the current config loader
