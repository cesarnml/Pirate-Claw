# Phase 25 Implementation Plan

**Status:** Delivered on stacked PRs #219, #220, #221, and #222.

Phase 25 turns the shipped Phase 24 restart contract into a truthful browser round-trip. Pirate Claw should stop treating restart as "request sent, good luck" and instead give the operator an inspectable restart journey backed by durable proof that the daemon instance actually came back.

## Epic

- `Phase 25 In-Browser Restart Round-Trip Proof`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-25-in-browser-restart-round-trip-proof.md`](../../01-product/phase-25-in-browser-restart-round-trip-proof.md)

## Grill-Me decisions locked for this phase (2026-04-23)

- Phase 25 builds on the shipped Phase 24 durability boundary and does not introduce a second ad hoc restart state store outside Pirate Claw-owned durable state.
- Restart completion proof must survive process exit and restart; browser memory, optimistic redirects, or timing-only inference are not acceptable proof.
- The first true vertical slice should be a real browser restart flow through an existing restart surface, not a hidden endpoint or harness-only proof mechanism.
- Browser disconnect immediately after an accepted restart request is expected product behavior and should map to `restarting`, not immediate failure.
- The implementation plan must choose one bounded timeout that converts `restarting` into `failed_to_return`; that timeout should be explicit, testable, and justified against the supported Synology contract.
- Phase 25 should prefer existing request/poll/load primitives over introducing a new websocket or push-only transport unless the simpler path proves insufficient.
- Shared restart wording across `/config`, layout banners, and onboarding matters enough to deserve its own slice after the first visible success path lands.

## Locked implementation contract

### Durable proof artifact

- The durable proof artifact for this phase is `.pirate-claw/runtime/restart-proof.json`.
- The file is written by the daemon before it exits for an accepted restart request and remains the single restart-proof artifact inside the existing Phase 24 durability boundary.
- The proof record must keep the request identity and timing fields needed to distinguish "request accepted by daemon instance A" from "request satisfied by daemon instance B": `requestId`, `requestedAt`, `requestedByStartedAt`, and, once resolved, `returnedAt` plus `returnedStartedAt`.
- Successful return proof is established only when a restarted daemon instance with a different `startedAt` reads the pending proof record and resolves it to `back_online`.

### Browser reconnection path

- Phase 25 reuses the existing request/load/poll model rather than introducing websocket or SSE transport.
- Browser-triggered restart continues to begin with the existing restart action response carrying `restartStatus.requestId` and `restartStatus.requestedAt`.
- After that response, browser surfaces should treat transient fetch failure or API disappearance as expected `restarting` behavior, not immediate error.
- Browser clients should poll `GET /api/daemon/restart-status` on a short interval using the existing client-side polling helper until the same `requestId` resolves to `back_online` or the timeout expires.
- Server-rendered layout/config loads remain unchanged except that, once the daemon returns, invalidation/reload should converge on the same restart vocabulary instead of inventing a second path.

### Timeout contract

- The timeout that converts `restarting` into `failed_to_return` is 45 seconds.
- This matches the current Phase 25 web helper constant and is long enough for the supported Synology restart path to survive container/process turnover without leaving the browser in an unbounded spinner.
- Anything beyond 45 seconds is treated as outside the trustworthy browser round-trip window for this phase and should route the operator toward host-level verification rather than broader deployment diagnostics.

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- existing restart endpoint and readiness semantics in [`src/api.ts`](../../../src/api.ts)
- existing restart affordances in [`web/src/routes/config/+page.svelte`](../../../web/src/routes/config/+page.svelte), [`web/src/routes/config/components/RestartDaemonBanner.svelte`](../../../web/src/routes/config/components/RestartDaemonBanner.svelte), and [`web/src/routes/+layout.svelte`](../../../web/src/routes/+layout.svelte)
- existing app-shell load path in [`web/src/routes/+layout.server.ts`](../../../web/src/routes/+layout.server.ts)
- existing durable state boundary: writable config directory, `pirate-claw.db`, and runtime artifacts under `.pirate-claw/runtime`

## Ticket Order

1. `P25.01 Restart Proof Contract and Durable Status Surface`
2. `P25.02 Config Restart Round-Trip Success Path`
3. `P25.03 Shared Restart State Model and Failed-Return UX`
4. `P25.04 Docs Exit and Phase Closeout`

## Ticket Files

- `ticket-01-restart-proof-contract-and-durable-status-surface.md`
- `ticket-02-config-restart-round-trip-success-path.md`
- `ticket-03-shared-restart-state-model-and-failed-return-ux.md`
- `ticket-04-docs-exit-and-phase-closeout.md`

## Exit Condition

An operator can trigger a restart from the browser, observe `requested -> restarting -> back_online | failed_to_return` through existing product surfaces, and trust that the final state is backed by durable proof from the restarted daemon instance rather than hope or manual shell verification.

## Phase Closeout

- **Retrospective:** `required`
- **Why:** Phase 25 changes the operator-facing restart workflow, introduces a durable browser/runtime proof contract, and sets assumptions that later deployment/polish work should not accidentally undo.
- **Trigger:** `product-impact`
- **Artifact:** `notes/public/phase-25-retrospective.md`
- **Scope:** retrospective writing is in scope for `P25.04`

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- the current ticket stays inside the approved Phase 25 boundary and does not widen into Mac deployment (`P26`), generic supervisor abstraction, or hot-reload redesign

## Ticket Boundary Notes

- `P25.01` is foundation-only: `.pirate-claw/runtime/restart-proof.json` semantics, the `GET /api/daemon/restart-status` read surface, and tests. It must stop short of broad operator-visible UX claims beyond the minimum needed to exercise the contract.
- `P25.02` is the first required visible slice: the `/config` restart action should carry a real operator through accepted request, temporary API loss, one-request polling against `GET /api/daemon/restart-status`, and successful return proof. If this ticket cannot show a real `back_online` journey, the foundation is insufficient.
- `P25.03` aligns the rest of the product with the shipped state model: layout banners, onboarding-affecting restart wording, and the already-chosen 45-second `failed_to_return` boundary all converge here. Do not bury those copy/state transitions back into `P25.01`.
- `P25.04` closes the phase, updates overview/operator docs, and writes the retrospective. It does not introduce new restart semantics.

## Explicit Deferrals

- Mac `launchd` or other non-Synology always-on deployment contracts
- generic supervisor abstraction across arbitrary Linux/NAS targets
- full hot reload of restart-backed settings
- websocket/SSE live transport work if existing browser polling/load behavior is sufficient
- broad UX/UI polish outside restart flows
- package/install distribution work

## Stop Conditions

Pause for review if:

- durable restart proof cannot be expressed cleanly inside the Phase 24 durability boundary
- the browser-visible proof model appears to require exposing sensitive restart state or write authority to client-side JavaScript
- the successful `/config` round-trip path requires a second independent restart vocabulary rather than reusing shared state names
- `failed_to_return` semantics cannot be made truthful without widening into broader deployment-health or supervisor-diagnostics work already deferred to later phases

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 25 ticket docs are merged to `main` and explicitly approved for delivery.
