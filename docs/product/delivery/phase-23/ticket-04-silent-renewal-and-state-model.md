# P23.04 Best-Effort Silent Renewal and Reconnect-Required States

## Goal

Use the stored device identity from `P23.01` to attempt silent Plex credential renewal and expose clear reconnect-required states when renewal fails.

## Scope

### Renewal behavior

- add demand-driven best-effort renewal first: startup, first Plex touch, and auth-failure retry path
- update the stored current Plex credential on successful renewal
- keep renewal server-owned; no renewal-sensitive material exposed to browser JS
- timer-driven pre-expiry renewal is optional only if it falls out almost for free after the demand-driven path is working

### UI state model

- extend the base state model from `P23.03` with `renewing`, `expired_reconnect_required`, and `error_reconnect_required`
- surface reconnect affordance from onboarding summary and `/config`
- distinguish auth-expired from PMS unreachable/version-incompatible where possible

### Failure handling

- renewal failures must not crash the daemon or break unrelated setup/config work
- failed renewal should preserve enough context to explain why reconnect is required

### Tests

- successful renewal rotates stored current credential
- failed renewal moves to reconnect-required state
- existing Plex enrichment tolerates reconnect-required without crashing

## Out Of Scope

- perfect or guaranteed uninterrupted renewal
- advanced auth diagnostics

## Exit Condition

Pirate Claw attempts silent renewal using stored device identity, updates the current Plex credential on success, and falls back to explicit reconnect-required UI state on failure.

## Rationale

This is the deliberate scope expansion that keeps Phase 23 from shipping a knowingly high-friction operator experience. It stays bounded by making renewal best-effort rather than absolute.
