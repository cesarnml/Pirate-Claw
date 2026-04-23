# P25.02 Config Restart Round-Trip Success Path

## Goal

Land the first real operator-visible restart round-trip through the existing `/config` restart flow: request accepted, daemon disappears, daemon returns, browser proves success.

## Scope

### `/config` flow

- wire the existing `/config` restart action to the new restart-proof read surface
- show truthful `requested` and `restarting` states while the API is temporarily unavailable
- transition to proven `back_online` when the restarted daemon instance satisfies the durable restart request

### Browser behavior

- define the reconnection path after the current daemon exits
- keep the first slice reviewable through a real browser path rather than hidden helpers
- add tests for the successful `/config` round-trip

## Out Of Scope

- aligning every other restart surface (`P25.03`)
- final timeout and `failed_to_return` UX across the app shell (`P25.03`)

## Exit Condition

An operator can trigger restart from `/config` and receive a truthful end-to-end success result that proves the daemon came back.

## Rationale

Phase 25 needs an early visible payoff. `/config` already owns the main restart-backed settings flow, so it is the right first place to prove the contract end to end.

This slice uses a same-origin SvelteKit proxy plus client polling so the browser can survive daemon downtime and verify the returned `requestId` without exposing private API base configuration to client-side code.
