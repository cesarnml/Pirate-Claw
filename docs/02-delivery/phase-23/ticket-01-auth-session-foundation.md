# P23.01 Plex Auth Session Foundation and Stored Identity Contract

## Goal

Introduce the server-owned Plex auth-session model and durable stored identity needed to support browser-managed Plex auth without forcing the operator to manage raw tokens or device material by hand.

## Scope

### Backend foundation

- define the persisted identity/session shape needed for Phase 23
- add server-side helpers to create, track, expire, and finalize a Plex auth session
- generate and persist a stable Plex client/device identifier
- persist the device key material or equivalent renewal identity required by the chosen Plex auth flow
- do **not** introduce the first `plex.token` config write in this ticket

### State model

- define the initial auth-state vocabulary consumed by later tickets
- separate auth-session state from Plex server reachability/version checks
- ensure the new stored identity path does not require a second operator-managed config file

### Tests

- session creation / expiry behavior
- stable client/device identifier persistence
- stored identity reload across process restart

## Out Of Scope

- browser redirect and callback wiring (`P23.02`)
- onboarding or `/config` UI (`P23.03`)
- renewal loop (`P23.04`)

## Exit Condition

The backend can create and persist a Plex auth session plus durable device identity without user-managed file editing, and tests cover the state model and reload behavior. No successful end-to-end credential write to `plex.token` lands in this ticket.

## Rationale

Best-effort renewal is not possible if the first ticket only captures a one-off access token. The durable foundation has to exist first, or later tickets will be forced into ad hoc persistence choices.
