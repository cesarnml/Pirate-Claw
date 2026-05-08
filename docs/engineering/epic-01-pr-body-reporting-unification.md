# Epic 01: PR Body Reporting Unification

This engineering epic tracks cleanup of the delivery orchestrator's reviewer-facing PR body reporting.

It is intentionally not a numbered Pirate Claw product phase. The target is maintainer workflow architecture, not new CLI or runtime behavior.

## Goal

Unify the external AI-review PR body reporting path so ticket-linked PRs and standalone PRs reuse the same reviewer-facing section builder and cleanup logic.

The practical bug behind this epic was simple: standalone PRs could accumulate stale manual `## External AI Review` prose above the managed review block, while ticket-linked PRs followed a different body-refresh path.

## In Scope

- one shared reviewer-facing `## External AI Review` section builder
- one shared PR-body cleanup/normalization path for external review reporting
- refactoring ticket-linked and standalone orchestrator flows to call the shared logic
- regression coverage for the duplicate-section failure mode seen on PR `#59`

## Out Of Scope

- AI-review polling redesign
- vendor fetcher changes beyond compatibility with the shared body helpers
- artifact storage redesign
- thread-resolution redesign
- broader review-pipeline modularization beyond PR body reporting

## Locked Decisions

- standalone PRs keep author-owned summary/body content outside the managed review section
- this epic is "PR body only", not "PR body plus thread resolution" and not a general AI-review architecture rewrite
- further ticket-linked vs standalone review-pipeline drift should be captured as follow-up work rather than widening this epic by default

## Intended Outcome

After this epic lands:

- ticket-linked and standalone PRs render the same reviewer-facing external review section for the same recorded review state
- standalone PR refreshes remove stale duplicate `## External AI Review` scaffolding instead of appending beside it
- reviewer-facing PR body cleanup rules live behind one orchestrator seam instead of diverging by flow type
