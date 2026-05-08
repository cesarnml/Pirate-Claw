# `E2.05 Shared Review Metadata Refresh Adapter`

## Goal

Converge the step that turns recorded review state into reviewer-facing PR metadata updates, while preserving the intentionally different outer PR-body shapes of the two modes.

## Why This Ticket Exists

Rendering helpers are already partly shared, but the refresh step still has separate orchestration for ticket-linked and standalone flows. This is where state/history presentation can drift even after recorded review data is aligned.

## Scope

- extract one adapter seam for "recorded review state -> PR metadata refresh"
- preserve ticket-linked summary/body construction for stacked delivery metadata
- preserve standalone author-owned body content outside the managed review block
- reuse the shared reviewer-facing review section generation and action-commit logic through the adapter seam
- add regression coverage around refresh behavior if current tests do not already lock it

## Acceptance Criteria

- ticket-linked and standalone flows use a shared refresh adapter seam
- ticket-linked PRs still render delivery metadata such as ticket id, ticket file, and stacked base branch
- standalone PRs still preserve author-owned content outside the managed AI-review section
- reviewer-facing external review presentation remains aligned for equivalent recorded review state

## Why This PR Stays Reviewable

This ticket does not change polling or review-state recording semantics. It only converges the refresh step that consumes already-normalized review state.

## Out Of Scope

- PR creation flow redesign
- command-surface simplification beyond what is needed to call the adapter
- body-storage redesign

## Rationale

- `Red first:` the first failure should be a metadata-refresh case where identical recorded review state produces visibly different reviewer-facing output across modes.
- `Why this path:` the adapter boundary is small and reviewable because the rendering primitives already exist; the work is mostly about centralizing composition without flattening the intentional differences.
- `Alternative considered:` forcing one fully identical PR-body builder for both modes was rejected because standalone PRs must preserve author-owned content while ticket-linked PRs must keep delivery metadata.
- `Deferred:` top-level command cleanup and final doc convergence remain for the last ticket.
- `Implemented seam:` ticket-linked and standalone refresh paths now share one recorded-review metadata adapter that feeds the same reviewer-facing external review section context into each mode while preserving stacked summary fields for ticketed PRs and author-owned body content outside the managed AI-review block for standalone PRs.
