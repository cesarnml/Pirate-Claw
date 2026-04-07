# Phase 08 Implementation Plan

Phase 08 adds per-media-type Transmission download directories, passing the resolved `downloadDir` at queue time.

## Epic

- `Phase 08 Media Placement`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Ticket Order

1. `P8.01 Per-Media-Type Download Directory Config`
2. `P8.02 Queue-Time Download Directory Resolution`
3. `P8.03 Docs And Example Config Update`

## Ticket Files

- `ticket-01-per-media-type-download-directory-config.md`
- `ticket-02-queue-time-download-directory-resolution.md`
- `ticket-03-docs-and-example-config-update.md`

## Exit Condition

Torrents queued from movie feeds use the configured movie download directory. Torrents queued from TV feeds use the configured TV download directory. When no per-type directory is configured, behavior is identical to the pre-Phase-08 baseline. Docs and example config reflect the new surface.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket and rationale
- the phase-level defaults and deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 08:

- Pirate-Claw-side post-completion file moves or renaming
- per-feed custom download directories beyond the two media types
- directory validation or creation via Transmission RPC

## Stop Conditions

Pause for review if:

- the `downloadDir` precedence logic forces changes to the label-routing fallback path
- the config change requires a migration for existing `transmission.downloadDir` users
