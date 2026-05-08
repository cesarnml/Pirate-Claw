# P24.02 Restart Durability Semantics and Persistence Proof

## Goal

Make supervised restart trustworthy at the daemon/runtime layer by hardening shutdown semantics as needed and proving that Pirate Claw's config and SQLite durability boundary survives the restart path together.

## Scope

### Runtime behavior

- harden shutdown/restart behavior as needed so `POST /api/daemon/restart` plus `SIGTERM` leads to a predictable supervisor-compatible exit
- preserve the approved process model; do not redesign the daemon to avoid restart semantics
- ensure restart-backed settings changes do not silently discard persisted runtime state

### Durability proof

- prove that the writable config directory and `pirate-claw.db` reload together after restart
- explicitly cover the Phase 23 Plex auth/device persistence boundary as part of the restart-durability proof
- add automated tests for the restart-safe persistence semantics that the Synology reference contract relies on

### Operator truth

- keep behavior truthful without introducing browser-visible return-proof UX
- document any runtime assumptions needed for the approved supervisor contract to stay valid

## Out Of Scope

- browser polling, daemon return-state UX, or other in-browser restart round-trip proof (`P25`)
- generic supervisor abstraction across platforms
- hot-reload redesign

## Exit Condition

Daemon-level restart behavior and automated persistence tests support the Synology restart contract, and Pirate Claw's config plus SQLite state boundary survives the approved restart path without requiring browser proof.

## Rationale

The current restart endpoint is only credible if the daemon exits predictably and reloads durable state coherently after supervision hands control back. That is application behavior, not just deployment prose.
