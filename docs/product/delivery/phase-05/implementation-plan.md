# Phase 05 Implementation Plan

Phase 05 adds two bounded operator policy controls: movie codec strictness and queue-time Transmission label routing. Neither changes the Phase 04 runtime model.

## Epic

- `Phase 05 Intake Policy And Transmission Routing`

Follow the shared guidance in [`docs/product/delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase. If scope still feels fuzzy, use `grill-me` before implementation.

## Ticket Order

1. `P5.01 Add Movie Codec Policy Mode`
2. `P5.02 Add Transmission Label Routing With Fallback`

## Ticket Files

- `ticket-01-add-movie-codec-policy-mode.md`
- `ticket-02-add-transmission-label-routing-with-fallback.md`

## Exit Condition

With `movies.codecPolicy` set to `require`, movie candidates that do not explicitly match configured codecs are not queued.

Torrent submissions include media-type labels (`movie` / `tv`) when supported by Transmission, and fallback-to-unlabeled submission keeps the pipeline functional when label support is unavailable.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket and rationale
- the phase-level defaults and deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 05:

- generalized per-feed custom label policy
- hard-fail mode when labels are unsupported
- media placement policy owned by Pirate Claw
- NAS packaging and deployment automation
- dashboard or UI consumption of routing metadata

## Stop Conditions

Pause for review if:

- codec policy mode requires restructuring the movie-match pipeline beyond a bounded predicate change
- Transmission label support detection requires broad adapter redesign beyond the fallback retry path
- label or policy logic forces a schema migration that changes existing persisted records
