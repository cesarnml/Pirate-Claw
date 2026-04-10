# Phase 14 Implementation Plan

Phase 14 extends the Phase 13 write path to cover the remaining structural config sections — feeds, movies, and TV defaults — via dedicated API endpoints and dashboard UI. Phase 13 proved the bearer + ETag/If-Match + atomic write pattern; Phase 14 applies it to the sections operators change most often.

## Epic

- `Phase 14 Feed Setup and Target Management MVP`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-14-feed-setup-and-target-management.md`](../../01-product/phase-14-feed-setup-and-target-management.md)

## Grill-Me decisions locked for this phase

- Dedicated endpoints per config section: `PUT /api/config/feeds`, `PUT /api/config/tv/defaults`, `PUT /api/config/movies` — no single god route.
- `tv.defaults` scope: resolutions and codecs only — no matchPattern at the defaults level.
- `codecPolicy` is required in the `PUT /api/config/movies` request body (`'prefer' | 'require'`).
- Feed fetch validation: blocking — reject the PUT with 400 if any new URL fails a 10-second HTTP 2xx check; existing URLs on disk are not re-fetched.
- Fixture snapshots from `GET /api/config` (with feeds populated, movies populated, tv.defaults populated) must be committed alongside each API ticket before any UI ticket that reads those fields begins implementation.
- Read-only state in the UI: disabled controls with tooltip `"Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing"` — same pattern as Phase 13 Settings.

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Existing config validation in [`src/config.ts`](../../../src/config.ts): `validateFeed`, `validateCompactTvDefaults`, `validateMoviePolicy`
- Existing write infrastructure in [`src/api.ts`](../../../src/api.ts): `buildConfigEtag`, `writeConfigAtomically`, bearer check, `If-Match` / 409 pattern from P13
- Existing TV section in [`web/src/routes/config/`](../../../web/src/routes/config/): `+page.server.ts`, `+page.svelte`

## Ticket Order

1. `P14.01 TV Defaults and Movie Policy Write Endpoints`
2. `P14.02 Feeds Write Endpoint`
3. `P14.03 TV Section UI`
4. `P14.04 Movies Policy UI`
5. `P14.05 Feeds UI`
6. `P14.06 Docs and Phase Exit`

## Ticket Files

- `ticket-01-tv-defaults-and-movie-policy-endpoints.md`
- `ticket-02-feeds-write-endpoint.md`
- `ticket-03-tv-section-ui.md`
- `ticket-04-movies-policy-ui.md`
- `ticket-05-feeds-ui.md`
- `ticket-06-docs-and-phase-exit.md`

## Exit Condition

With write token configured, an operator can manage all feeds and core matching policy (TV defaults, movie policy, show targets) from the browser without touching the config file directly. CLI and direct file editing remain fully supported parallel paths. Each config section is independently writable via its own endpoint.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- fixture snapshots are committed before any dependent UI ticket begins

## Explicit Deferrals

These stay out of scope for Phase 14:

- per-show codec/resolution overrides beyond the global defaults
- per-feed poll interval editing
- feed URL reachability suggestions or auto-retry on transient failures
- advanced movie policy (per-feed rules, per-year overrides)
- unified Config page UX with inline validation, toasts, and post-save restart offer (Phase 16)
- `POST /api/daemon/restart` (Phase 16)
- TLS, SSO, or auth beyond the Phase 13 bearer-on-write model

## Stop Conditions

Pause for review if:

- implementing any endpoint requires touching `buildConfigEtag` or `writeConfigAtomically` in a way that changes their contract for existing P13 consumers
- blocking feed fetch introduces a timeout or retry mechanism that significantly changes the daemon's request-handling behavior
- any UI ticket requires client-side exposure of the write token

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 14 ticket docs are merged to `main` and explicitly approved for delivery.

## Delivery status

Planning/decomposition only. Implementation has not started.
