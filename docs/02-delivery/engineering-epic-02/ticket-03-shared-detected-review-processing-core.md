# `E2.03 Shared Detected-Review Processing Core`

## Goal

Share the lifecycle for the case where AI review is actually detected and must be triaged, persisted, and normalized.

## Why This Ticket Exists

Detected-review handling is where the two flows still duplicate the same conceptual work: write artifacts, triage findings, resolve thread follow-up when applicable, normalize vendors, and assemble recorded review data.

## Scope

- extract one shared helper for detected-review processing after polling
- include artifact writing and normalized review-snapshot assembly
- include triager result normalization and vendor fallback rules
- include thread-resolution persistence behavior when the outcome requires it
- keep storage roots mode-specific while sharing the processing model

## Acceptance Criteria

- ticket-linked and standalone flows both call the same detected-review processing core
- the shared core supports both plan-keyed and standalone artifact destinations without forcing one storage layout
- thread-resolution persistence continues to work for patched follow-up paths
- reviewer-facing inputs produced by the shared core stay compatible with existing rendering helpers

## Why This PR Stays Reviewable

This ticket only handles the "review detected" branch. It does not yet take on no-review timeouts, PR metadata refresh, or top-level command rewiring, which keeps the diff bounded.

## Out Of Scope

- clean/no-feedback recording
- standalone note-file redesign
- PR metadata refresh adapter work

## Rationale

- `Red first:` the first failure should be a detected-review case where triage or persisted review metadata differs by flow for the same underlying review result.
- `Why this path:` detected-review processing is a coherent seam with clear inputs and outputs, making it small enough for one stacked PR without hiding unrelated control-flow changes.
- `Alternative considered:` converging both detected-review and no-review branches together was rejected because the combined PR would be harder to reason about in review.
- `Deferred:` timeout/no-feedback handling and refresh adapters remain separate tickets.
- `Implemented seam:` both ticket-linked and standalone review-detected branches now route through one shared processor that writes artifacts, runs triage, applies vendor fallback, persists thread resolutions when the mode/outcome allows it, and returns the normalized review snapshot consumed by the mode-specific callers.
