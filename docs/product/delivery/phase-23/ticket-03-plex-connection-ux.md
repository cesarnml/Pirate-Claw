# P23.03 Onboarding and Config Plex Connection UX

## Goal

Expose the new browser auth flow through the setup wizard and `/config`, using one shared state model and one shared set of auth primitives.

## Scope

### Onboarding

- add a dedicated Plex step to the Phase 22 wizard after write access is available
- show `not_connected`, `connecting`, `connected`, and `reconnect_required` states clearly
- allow the operator to skip Plex because the integration remains optional

### `/config`

- replace the legacy manual token-first UX with browser connect / reconnect / disconnect affordances
- show the same auth state vocabulary used by onboarding
- keep `plex.url` editable as an operator-managed PMS URL

### Shared UI primitives

- one shared Plex auth card/state display used by onboarding and `/config`
- no wizard-only strings or hidden alternate logic branches
- this ticket establishes the base shared operator-facing state model before renewal-specific states are added

## Out Of Scope

- renewal scheduling / `renewing` / expired-vs-error reconnect lifecycle detail (`P23.04`)
- server discovery or account switching

## Exit Condition

An operator can initiate browser Plex connect from onboarding or `/config`, see the same auth-state vocabulary in both places, and is no longer pushed toward manual token extraction as the primary path.

## Rationale

If onboarding and `/config` diverge here, Phase 23 will immediately create two different Plex setup stories. The shared UX contract needs to land before lifecycle complexity is added.
