# Phase 06 Implementation Plan

Phase 06 is a documentation-and-validation phase that proves one concrete Synology deployment baseline for always-on Pirate Claw + Transmission operation.

## Epic

- `Phase 06 Synology Runbook`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase. The decomposition below already reflects the Phase 06 `grill-me` pressure-test and developer-approved constraints gathered before implementation.

## Baseline

The validated baseline for this phase is:

- Synology `DS918+`
- DSM `7.1.1-42962 Update 9`
- Synology Docker package (on DSM 7.1.x the package is named `Docker`; DSM 7.2+ renamed it to `Container Manager`)
- one canonical known-good Pirate Claw image reference
- one canonical Transmission container baseline
- bind-mounted durable state on Synology storage
- local-LAN-first operation

Portability notes for other Synology models or DSM variants belong only in the final portability ticket.

## Canonical Operator Artifact

This phase should build one canonical operator runbook at:

- `docs/02-delivery/phase-06/synology-runbook.md`

Ticket rationale files carry detailed validation notes and raw proof. The runbook itself should stay operator-facing and should include only the checkpoints or verification cues an operator actually needs while following it.

## Execution Mode

Phase 06 is approved to execute as direct-to-`main` docs-validation slices rather than the stacked PR orchestrator flow.

That exception is intentional for this phase because:

- the primary output is validated operator documentation rather than product-code expansion
- the work depends on live hands-on NAS validation more than asynchronous stacked review
- expected code churn is minimal and should appear only when a small bounded fix is strictly necessary to keep the runbook truthful

The ticket order and ticket boundaries still apply. Each ticket should land as its own reviewable documentation-and-validation slice on `main`, with the same rationale, proof, and stop-condition discipline the stacked flow would require.

## Ticket Order

1. `P6.01 Runbook Skeleton And Acceptance Checklist`
2. `P6.02 Synology Storage Layout And Mount Baseline`
3. `P6.03 Transmission Container Baseline`
4. `P6.04 Pirate Claw Container Baseline`
5. `P6.05 Secrets And Env Injection`
6. `P6.06 Daemon Restart Semantics`
7. `P6.07 Upgrade Path`
8. `P6.08 Fresh End-To-End Runbook Validation`
9. `P6.09 Troubleshooting Guide`
10. `P6.10 Portability Notes And Explicit Non-Validated Differences`

## Ticket Files

- `ticket-01-runbook-skeleton-and-acceptance-checklist.md`
- `ticket-02-synology-storage-layout-and-mount-baseline.md`
- `ticket-03-transmission-container-baseline.md`
- `ticket-04-pirate-claw-container-baseline.md`
- `ticket-05-secrets-and-env-injection.md`
- `ticket-06-daemon-restart-semantics.md`
- `ticket-07-upgrade-path.md`
- `ticket-08-fresh-end-to-end-runbook-validation.md`
- `ticket-09-troubleshooting-guide.md`
- `ticket-10-portability-notes-and-explicit-non-validated-differences.md`

## Exit Condition

A clean `DS918+ / DSM 7.1.1-42962 Update 9` Synology environment can be configured by following the canonical runbook only, resulting in:

- always-on Transmission and Pirate Claw containers managed by the Docker package
- durable bind-mounted config, runtime, and download/media paths on Synology storage
- end-to-end secret and env injection documented without hidden prerequisites
- a proven happy-path validation using one specific safe validation input
- documented restart, upgrade, troubleshooting, and operator verification steps
- explicit separation between validated baseline behavior and non-validated portability guidance

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the current ticket updates the canonical runbook or its acceptance checklist as needed
- the current ticket captures rationale and concrete proof for any operational claim it adds
- the current ticket keeps the validated baseline anchored to `DS918+ / DSM 7.1.1-42962 Update 9`
- the phase-level deferrals and operator-facing boundaries remain unchanged

There is one explicit developer control point after `P6.01`. Do not begin Synology validation work for `P6.02+` until the runbook skeleton, ticket order, and acceptance checklist are reviewed and approved.

## Allowed Product Fixes

Phase 06 may include only small bounded product fixes that are strictly necessary to keep the validated runbook truthful.

Do not absorb:

- new deployment tooling
- runtime architecture expansion beyond the existing daemon/container model
- broad CLI or config redesign
- speculative Synology convenience work that is not required to make the baseline runbook accurate

If validation reveals a larger gap, stop the ticket and spin that work into a separate product or engineering phase.

## Explicit Deferrals

These are intentionally out of scope for Phase 06:

- repo-managed Docker Compose deployment bundles
- one-click Synology installation tooling
- backup and restore automation
- remote-access-first setup as a required baseline
- validation claims for DSM or Synology variants not explicitly tested in this phase
- broad product changes beyond small truth-preserving fixes required by Synology validation

## Stop Conditions

Pause for review if:

- the validated `DS918+ / DSM 7.1.1-42962 Update 9` baseline cannot support the existing daemon/runtime model without material product expansion
- Docker package setup requires undocumented build or packaging machinery beyond the agreed operator-provided image path
- Synology storage, permissions, or mount behavior force a broader product redesign rather than a bounded documentation or validation change
- a required runbook claim cannot be validated on the target NAS and cannot honestly be downgraded to explicit non-validated portability guidance
