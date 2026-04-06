# `E2.06 Command Rewire And Doc Convergence`

## Goal

Reduce the remaining top-level duplication in the ticket-linked and standalone command paths so they become thin composition around the shared post-PR review lifecycle.

## Why This Ticket Exists

After the semantic and adapter seams are shared, the main remaining risk is structural duplication in the command handlers themselves. This ticket performs the final bounded cleanup and updates the docs to describe the architecture truthfully.

## Scope

- rewire `pollReview`, `recordReview`, and standalone `ai-review` to compose the shared lifecycle helpers rather than re-implementing them inline
- keep ticket-only and standalone-only outer responsibilities at the command edge
- update delivery docs and related engineering docs so the architecture description matches the real convergence boundary and intentional separations
- update docs indexes for any new durable planning paths introduced by this epic

## Acceptance Criteria

- top-level command handlers are materially thinner and delegate to the shared lifecycle helpers
- docs accurately describe what is unified and what remains intentionally separate
- no new architectural work is pulled in from pre-PR orchestration, state repair, or stacked-closeout
- the final result still reads as a sequence of reviewer-sized PRs rather than a one-shot refactor

## Why This PR Stays Reviewable

This ticket comes last on purpose. By the time it lands, the risky semantic extractions are already isolated and reviewed, so this PR is mainly glue cleanup plus doc updates.

## Out Of Scope

- new behavior beyond the approved convergence boundary
- additional orchestrator modularization unrelated to post-PR review flow convergence
- follow-up cleanup ideas discovered during implementation but not required for this epic

## Rationale

- `Red first:` the first failure should be a command-path regression where previously shared helper behavior stops being called correctly from one mode.
- `Why this path:` leaving command rewiring until last keeps earlier PRs behavior-focused and lets the final cleanup read as straightforward composition simplification.
- `Alternative considered:` doing command rewiring in the first or middle ticket was rejected because it would make every earlier PR harder to review and harder to bisect.
- `Deferred:` any broader orchestrator decomposition beyond this post-PR lifecycle should become a separate epic if still valuable after convergence lands.
- `Implemented seam:` `poll-review`, `record-review`, and standalone `ai-review` now delegate their final recorded-review persistence through shared ticketed and standalone command-layer helpers, so the remaining mode-specific code stays at the edge while the converged post-PR lifecycle rules flow through one path.
