# P17.04 Onboarding Done Step, Completion Gate, and Resume Polish

## Goal

Finish the onboarding flow by implementing the Done step, minimum-completion gate, summary view, and explicit resume behavior across partial setups.

## Prerequisites

- P17.01 merged
- P17.02 merged
- P17.03 merged

## Scope

### Completion gate — `web/src/routes/onboarding/`

- Implement the agreed minimum-completion rule:
  - at least one feed
  - and at least one TV show or one movie year
- The Done step is not reachable until that minimum is satisfied.
- The wizard remains dismissible; dismissal is not treated as completion.

### Done step and summary

- Render a summary of what onboarding configured:
  - feed count and/or first feed identity
  - whether TV show and/or movie targets were added
- Add “Go to Dashboard” CTA as the canonical exit action.
- Keep the step read-only; no new saves happen on Done.

### Resume behavior and polish

- Make the partial-setup path explicit:
  - no forced redirect once the config is no longer strictly empty
  - onboarding can still be resumed intentionally
- Finalize the resume affordance behavior and copy across onboarding/home/config surfaces introduced earlier in the stack.

### Tests

- Done step inaccessible before minimum completion condition
- Done step reachable after feed + TV target
- Done step reachable after feed + movie target
- dismissing onboarding does not mark setup complete
- partial setup exposes resume behavior without auto-redirect

## Out of Scope

- distributed empty-state work on other routes
- docs/status updates

## Exit Condition

The onboarding flow has a coherent end state: it knows when minimum setup is satisfied, can summarize what was configured, exits to the dashboard cleanly, and supports explicit resume without trapping manual config-first users.

## Rationale

This ticket owns the cross-step state machine rather than burying it in one of the target tickets. That keeps the movie and TV target tickets focused on their write semantics and makes the completion rules easy to review.

The done state is implemented as a read-only summary on `/onboarding` instead of an automatic redirect so operators can see what the guided flow actually configured before leaving. Resume behavior stays lightweight: the dashboard and config page surface links back into onboarding, while the strict auto-trigger remains limited to the initial-empty case.
