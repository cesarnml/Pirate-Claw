# P24.04 Restart Copy and Product/Runbook Alignment

## Goal

Align the shipped restart language with the delivered Synology restart contract so Pirate Claw stops implying more certainty than it can prove before Phase 25.

## Scope

### Product copy

- tighten restart-related copy and affordances only where current UI language overclaims success or support
- keep the restart story accurate after the runtime durability contract from `P24.02`
- preserve the current UX shape unless a wording-level affordance change is required for truthfulness

### Runbook alignment

- align README and Synology-specific guidance with the delivered reference artifact and restart behavior
- ensure the app and operator docs describe the same supported restart path and durability assumptions

### Validation

- verify that restart-related product/runbook wording stays inside the approved Phase 24 truthfulness boundary

## Out Of Scope

- browser polling or restart return-state confirmation (`P25`)
- Mac always-on deployment (`P26`)
- broad UX/UI polish

## Exit Condition

Restart-related UI and operator docs make the same truthful claim about what Pirate Claw can and cannot prove after a restart request on Synology.

## Rationale

Phase 24 should not leave a gap where runtime behavior improves but the UI still promises a stronger restart guarantee than the product actually has. That gap is what Phase 25 exists to close fully.
