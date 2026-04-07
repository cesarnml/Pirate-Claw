# `P6.06 Daemon Restart Semantics`

## Goal

Document and validate what happens to the always-on Pirate Claw + Transmission baseline after container restarts and NAS restarts.

## Why This Ticket Exists

Restart behavior is an explicit Phase 06 commitment and a different operator question from “can I create the containers once.” It needs its own ticket so the validation stays focused and reviewable.

## Scope

- document the expected restart behavior for the validated Container Manager baseline
- validate that Pirate Claw daemon mode and Transmission recover correctly after the restart scenarios the runbook claims to support
- document where to inspect state, logs, or mounts when restart recovery looks wrong
- add operator-facing restart verification cues to the canonical runbook
- capture the detailed validation evidence in the ticket rationale

## Out Of Scope

- image-tag upgrade procedure
- final fresh clean-environment walkthrough
- broad health-check or orchestration expansion beyond the existing runtime model

## Rationale

- `Red first:` always-on NAS operation is not proven until the documented restart scenarios are shown to preserve the runbook baseline.
- `Why this path:` a dedicated restart ticket keeps the steady-state setup tickets thin and turns operational continuity into an explicit reviewed claim instead of an assumption.
- `Alternative considered:` folding restart checks into the initial Pirate Claw setup ticket was rejected because restart continuity is a distinct failure domain with different validation evidence.
- `Deferred:` upgrade mechanics and full clean-environment walkthrough remain later tickets.
