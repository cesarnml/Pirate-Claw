# P23.02 Browser Redirect/Return Flow and Config Persistence

## Goal

Wire the browser-visible Plex sign-in path end to end: start auth, redirect to Plex, return to Pirate Claw, finalize auth, and persist the usable Plex credential into the existing config shape.

## Scope

### API

- add the start-auth endpoint used by the browser
- add the return/finalize endpoint or callback handler that completes the flow
- persist the resulting current Plex credential into `plex.token`
- preserve `plex.url` as an explicit operator-managed field

### Flow behavior

- support user cancellation and expired session retry
- ensure callback failures surface a clear operator-facing error state rather than a silent broken config write
- ensure the flow reuses existing config write semantics instead of bypassing them
- expose the thinnest real operator-visible Connect affordance needed to exercise the full round-trip

### Tests

- successful auth completion writes `plex.token`
- canceled or expired sessions do not partially corrupt existing Plex config
- legacy no-Plex config upgrades cleanly into the connected state

## Out Of Scope

- onboarding/config UX polish (`P23.03`)
- silent renewal (`P23.04`)

## Exit Condition

The browser can complete the Plex sign-in round-trip through a real visible Connect action, and Pirate Claw stores the resulting usable Plex credential in the existing config model without manual token extraction.

## Rationale

Phase 23 succeeds or fails on whether the operator can complete the browser auth round-trip cleanly. This ticket lands the critical vertical slice before UI convenience work layers on top.
