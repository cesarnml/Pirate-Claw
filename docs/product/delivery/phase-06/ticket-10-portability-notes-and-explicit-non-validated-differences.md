# `P6.10 Portability Notes And Explicit Non-Validated Differences`

## Goal

Add one explicit final section that distinguishes the validated `DS918+ / DSM 7.1.1-42962 Update 9` baseline from likely-portable but non-validated Synology variations.

## Why This Ticket Exists

Portability notes are useful, but they should not blur the line between “proven on this NAS baseline” and “likely to work elsewhere.” This distinction needs its own final ticket.

## Scope

- document the explicit boundary between the validated baseline and non-validated portability guidance
- capture likely differences for other Synology models, DSM variants, or remote-access setups only as clearly-labeled informational notes
- keep the canonical runbook honest about what this phase did and did not validate
- store any supporting rationale in the ticket doc without turning portability notes into additional validation claims

## Out Of Scope

- hands-on validation on other Synology hardware or DSM versions
- expanding the baseline to remote-access-first setups
- new automation or deployment tooling

## Rationale

- `Red first:` the runbook must not accidentally over-claim beyond what was actually validated on the target NAS.
- `Why this path:` a dedicated portability ticket preserves the credibility of the baseline while still making the document useful to operators on nearby Synology variants.
- `Alternative considered:` scattering portability notes throughout the runbook was rejected because it would dilute the canonical validated path with speculative branches.
- `Deferred:` any actual validation on other Synology environments belongs to a later phase or follow-up plan.

## Rationale

- The validated baseline is explicitly scoped to DS918+ / DSM 7.1.1-42962 Update 9 with Docker 20.10.3 on kernel 4.4.x.
- The `statx` ENOSYS issue affects all Synology models running kernel 4.4.x, which includes all Apollo Lake models regardless of DSM version (7.1.x, 7.2.x). This is the most important portability note because it means the `/config/` mount workaround is required on a broad set of Synology hardware.
- ARM-based Synology models are explicitly excluded because the Docker image is built for `linux/amd64` only.
- DSM 7.2's rename of Docker to Container Manager is noted as a UI-only difference with no expected functional impact.
- Remote access, multi-volume RAID, and clustered setups are explicitly listed as out of scope to prevent over-claiming.
