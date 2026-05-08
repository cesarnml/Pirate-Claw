# Phase 13 Implementation Plan

Phase 13 adds a bounded config write path for runtime settings through the daemon API and dashboard Settings UI, with explicit opt-in auth, optimistic concurrency, and restart-required operator messaging.

## Epic

- `Phase 13 Daemon Config Write API and Settings (Bounded Runtime Subset)`

Follow the shared guidance in [`docs/product/delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/product/plans/phase-13-daemon-config-write-api-and-settings.md`](../../01-product/phase-13-daemon-config-write-api-and-settings.md)

## Grill-Me decisions locked for this phase

- Editable subset is runtime-only in v1: `runtime.apiPort`, `runtime.runIntervalMinutes`, `runtime.reconcileIntervalSeconds`, `runtime.tmdbRefreshIntervalMinutes`.
- Write token model is config + env override: `runtime.apiWriteToken` with `PIRATE_CLAW_API_WRITE_TOKEN` precedence.
- `.env.example` must be updated as part of this phase.

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Existing config validation path in [`src/config.ts`](../../../src/config.ts)
- Existing read API surface in [`src/api.ts`](../../../src/api.ts)
- Existing Settings read-only route in [`web/src/routes/config/`](../../../web/src/routes/config/)

## Ticket Order

1. `P13.01 Config Model and Token Wiring`
2. `P13.02 Config Resource Read Metadata`
3. `P13.03 Auth-Gated Config Write Endpoint`
4. `P13.04 If-Match Conflict Contract`
5. `P13.05 Web Settings Server-Side Save Flow`
6. `P13.06 Restart UX and Bounded Field Guards`
7. `P13.07 Docs, Env Example, and Phase Exit`

## Ticket Files

- `ticket-01-config-model-and-token-wiring.md`
- `ticket-02-config-read-revision-metadata.md`
- `ticket-03-auth-gated-config-write-endpoint.md`
- `ticket-04-if-match-conflict-contract.md`
- `ticket-05-web-settings-server-save-flow.md`
- `ticket-06-restart-ux-and-bounded-guards.md`
- `ticket-07-docs-env-example-and-phase-exit.md`

## Exit Condition

With write token configured, an operator can edit only approved runtime fields from the dashboard, save through server-side proxying with bearer auth and optimistic concurrency (`ETag` + `If-Match` + `409` on mismatch), and receive explicit restart-required messaging after successful save. Existing read endpoints and redaction behavior remain intact.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- bounded runtime-only scope is preserved

## Explicit Deferrals

These stay out of scope for Phase 13:

- feeds/rules authoring or broad config editing UI
- hot reload of daemon config without restart
- non-config mutating API features (manual queue/retry/etc.)
- auth models beyond bearer-on-write for this bounded write surface

## Stop Conditions

Pause for review if:

- implementing runtime-only edit flow requires widening to feeds/rules structures
- token or concurrency design breaks compatibility with existing read-only API consumers
- atomic write semantics cannot be preserved with the current config path model

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 13 ticket docs are merged to `main` and explicitly approved for delivery.

## Delivery status

Planning/decomposition only. Implementation has not started.
