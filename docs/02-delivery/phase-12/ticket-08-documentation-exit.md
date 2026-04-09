# P12.08 Documentation and Phase Exit

## Goal

Update operator-facing documentation after all Phase 12 UI migrations are merged — **no application code** in this ticket.

## Scope

- [`README.md`](../../../README.md): refresh the `web/` / dashboard section for the design system (shadcn-svelte), build/run commands, and any **new** environment variables if P12.01 introduced them (omit if none).
- [`docs/00-overview/start-here.md`](../../00-overview/start-here.md): adjust only if operator-facing commands or dashboard description must change to match shipped behavior.
- [`docs/01-product/phase-12-dashboard-design-system-and-read-ui.md`](../../01-product/phase-12-dashboard-design-system-and-read-ui.md): when the phase is complete, update **Delivery status** and point to this implementation plan (single concise edit).
- Run `bun run spellcheck` for touched docs.

## Out Of Scope

- Phase 13 or Phase 14 documentation.
- `docs/02-delivery/phase-12/implementation-plan.md` content changes beyond a brief “complete” note if the repo convention expects it at closeout.

## Exit Condition

Documentation reflects the delivered dashboard; product phase doc delivery status updated; spellcheck clean.

## Rationale

- **`README.md`**: Documented shadcn-svelte + Tailwind 4 under `web/` (pointers to `components.json` and `app.css`).
- **`docs/00-overview/start-here.md`**: Current state now references Phase 12 as delivered via the phase-12 implementation plan; Phases 13–14 still pending.
- **`docs/01-product/phase-12-dashboard-design-system-and-read-ui.md`**: Delivery status set to **Delivered** with a link to the implementation plan.
- **`docs/00-overview/roadmap.md`**: Phase 12 marked delivered; planning posture distinguishes Phase 12 vs Phase 13.
- **`docs/README.md`**: Product and delivery index entries updated for Phase 12 delivered state.
- No new environment variables for Phase 12 beyond existing `PIRATE_CLAW_API_URL` (and prior TMDB key behavior).
