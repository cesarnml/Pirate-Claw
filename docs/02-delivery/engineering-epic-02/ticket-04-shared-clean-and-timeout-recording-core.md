# `E2.04 Shared Clean And Timeout Recording Core`

## Goal

Share the lifecycle for the case where no actionable AI review is ready to record, including clean timeouts and no-feedback windows.

## Why This Ticket Exists

The non-detected and partial-timeout branches are easy to treat as "simple," which is exactly why they drift. This ticket converges the clean/no-feedback and incomplete-agent recording behavior separately from the detected-review path.

## Scope

- extract shared helpers for:
  - no-review `clean` recording
  - partial-timeout note formatting
  - incomplete-agent persistence
  - repeated-pass clean notes when earlier cycles were `patched`
- rewire ticket-linked and standalone flows to use the shared clean/timeout core
- preserve mode-specific storage and command entry behavior

## Acceptance Criteria

- both flows use the same clean/no-feedback and partial-timeout semantic core
- incomplete-agent notes and clean timeout notes remain consistent across both modes where semantics should match
- prior `patched` history is preserved consistently when a later pass records `clean`
- existing timeout and no-feedback behavior tests continue to pass

## Why This PR Stays Reviewable

This ticket is the mirror image of `E2.03`: one narrow branch of the review lifecycle, isolated from PR metadata refresh and top-level command cleanup.

## Out Of Scope

- detected-review processing extraction beyond what is already shared from `E2.03`
- PR metadata refresh convergence
- event/notification cleanup beyond minimal wiring

## Rationale

- `Red first:` the first failure should be a clean/no-feedback path where one flow records different note semantics or loses incomplete-agent state.
- `Why this path:` keeping the no-review branch separate from the detected-review branch produces a smaller and more readable PR than trying to collapse both paths at once.
- `Alternative considered:` leaving timeout behavior in place while only unifying detected reviews was rejected because timeout handling is already part of the observed drift surface.
- `Deferred:` metadata refresh and command-level rewiring remain for later tickets.
- `Implemented seam:` ticket-linked and standalone clean/no-feedback branches now share one clean/timeout processor for incomplete-agent persistence, timeout note selection, no-feedback note selection, and cumulative `patched` preservation, while the surrounding callers keep ownership of their mode-specific storage and PR-update behavior.
