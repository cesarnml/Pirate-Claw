# P24.03 Plex/Synology Compatibility Truthfulness Slice

## Goal

Keep Pirate Claw's Synology product story honest when Plex Media Server packaging reality falls below the documented support floor by landing the thinnest operator-visible truth signal needed in the shipped surface.

## Scope

### Operator-visible truthfulness

- add the thinnest setup/config/operator-visible signal needed where current Plex-on-Synology wording would otherwise overclaim support
- distinguish the reviewed Synology reference baseline from an operator-managed compatible-service path
- make the supported remediation path explicit when the Synology Package Center Plex build lags the required compatibility floor

### Boundaries

- preserve Plex as an optional integration
- keep the slice narrow and truthfulness-driven rather than diagnostic-heavy
- align the delivered behavior with the Phase 24 product contract around PMS compatibility reality

### Tests / validation

- cover the new operator-visible truth signal enough to keep the support posture reviewable

## Out Of Scope

- richer Plex diagnostics or compatibility probing
- Plex server discovery or account-management flows
- broad UX polish or setup redesign

## Exit Condition

The app no longer implies a supported Plex-on-Synology state that the documented baseline cannot actually satisfy, and the operator-facing remediation path is explicit.

## Rationale

If the truth about Synology Plex compatibility only appears in the final docs ticket, the product remains misleading for most of the phase. This slice lands the minimal honesty fix as real product behavior.
