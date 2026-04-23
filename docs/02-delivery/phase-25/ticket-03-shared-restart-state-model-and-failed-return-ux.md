# P25.03 Shared Restart State Model and Failed-Return UX

## Goal

Converge the rest of the product on one truthful restart vocabulary and add the bounded `failed_to_return` state when the daemon does not come back in time.

## Scope

### Shared state model

- apply the restart lifecycle vocabulary consistently across layout banners, `/config`, and any onboarding-adjacent restart messaging
- remove or replace copy that still stops at "restart requested"
- keep one shared explanation of what the browser can and cannot prove

### Failure handling

- choose and implement the timeout that converts `restarting` into `failed_to_return`
- show a bounded failure state with clear operator guidance when the daemon does not return in time
- add tests for timeout-driven failure behavior and shared state rendering

## Out Of Scope

- deeper deployment diagnostics or generic supervisor health tooling
- unrelated UX polish outside restart flows

## Exit Condition

Pirate Claw uses one restart vocabulary across its existing surfaces and reports a bounded `failed_to_return` state truthfully when restart proof never arrives.

## Rationale

The success path alone is not enough. Without a shared failure model, Pirate Claw would still overclaim certainty the moment the happy path breaks.

This ticket sets one browser-side timeout of 45 seconds for `failed_to_return`, which is long enough for the supported Synology restart path to hand control back on a normal restart without leaving the UI in an indefinite `restarting` state when the daemon never returns.
