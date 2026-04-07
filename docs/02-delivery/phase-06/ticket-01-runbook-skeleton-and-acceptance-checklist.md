# `P6.01 Runbook Skeleton And Acceptance Checklist`

## Goal

Create the canonical Phase 06 operator runbook skeleton and lock the acceptance checklist before any DS918+ validation tickets begin.

## Why This Ticket Exists

Phase 06 is a documentation-and-validation phase. The operator journey, evidence standard, and validated baseline need to be explicit before later tickets start accreting Synology-specific detail.

## Scope

- create `docs/02-delivery/phase-06/synology-runbook.md` as the single canonical operator-facing runbook
- define the runbook sections in operator-journey order
- capture the validated baseline explicitly as `DS918+ / DSM 7.1.1-42962 Update 9`
- add the acceptance checklist the later tickets must satisfy
- mark where operator-facing verification cues belong in the runbook versus where raw proof belongs in ticket rationale
- note the canonical image-reference rule, fake-but-concrete example-values rule, and local-LAN-first baseline rule

## Out Of Scope

- validating any Synology setup step on the NAS
- creating the Transmission or Pirate Claw containers
- secrets, restart behavior, upgrade flow, or troubleshooting detail beyond the skeleton needed to frame later tickets

## Rationale

- `Red first:` Phase 06 should not begin hands-on validation without one agreed runbook shape and one explicit acceptance bar.
- `Why this path:` a dedicated skeleton ticket keeps the canonical runbook from fragmenting across later tickets and creates the explicit developer control point the phase requires before NAS validation starts.
- `Alternative considered:` letting the runbook structure emerge inside the first setup ticket was rejected because it would make the first DS918+ validation slice too broad and would hide the evidence standard until too late.
- `Deferred:` all hands-on validation and operational claims remain later tickets in this phase.
