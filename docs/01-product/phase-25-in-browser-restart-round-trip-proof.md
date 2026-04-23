# Phase 25: In-Browser Restart Round-Trip Proof

**Delivery status:** Planned — implementation plan and ticket draft exist under `docs/02-delivery/phase-25/`; awaiting developer approval and merge to `main` before delivery starts.

Phase 25 follows the Synology restart-durability contract from Phase 24. Once Pirate Claw can restart correctly under supervision, the browser should stop treating restart as a fire-and-forget hope and start showing a truthful restart journey with proof that the daemon actually came back.

This phase does not reopen the durability boundary. It builds on the shipped Phase 24 contract: the writable config directory, `pirate-claw.db`, and Pirate Claw runtime artifacts under `.pirate-claw/runtime` remain the durable state boundary across restart.

## TL;DR

**Goal:** let the operator request a restart from the browser and observe a truthful round-trip result.

**Ships:** restart request tracking, browser-visible restart states, durable proof that a restarted daemon instance came back, reconnect behavior across daemon disappearance, and failure handling when the daemon does not return in time.

**Defers:** non-Synology platform deployment work, broader deployment packaging, and deep hot-reload redesign.

## Phase Goal

Phase 25 should leave Pirate Claw in a state where:

- the browser can request a restart without pretending success the moment the process exits
- the operator can observe at least `requested`, `restarting`, `back_online`, and `failed_to_return` outcomes
- restart completion is backed by a real proof signal from the restarted daemon instance
- restart-backed setup/config changes feel trustworthy because the product distinguishes "restart was requested" from "restart finished"
- the proof model preserves the Phase 24 durability boundary instead of inventing a second restart state store

## Committed Scope

### Durability and proof boundary

- keep the Phase 24 durability contract intact: writable config directory, `pirate-claw.db`, and `.pirate-claw/runtime`
- persist restart proof in Pirate Claw-owned durable state rather than browser memory or timing-only inference
- make the proof inspectable enough that operators and tests can tell why Pirate Claw concluded `back_online` or `failed_to_return`
- do not treat plain process disappearance or a blind page refresh as proof that restart succeeded

### Restart round-trip contract

- define a restart request identifier or equivalent proof mechanism that survives the handoff across process exit and supervisor restart
- require the restarted daemon to expose enough durable state for the browser to confirm that the post-restart instance is the one that satisfied the request
- treat browser disconnect immediately after an accepted restart request as an expected transition into `restarting`, not as immediate failure
- require a bounded return window with an explicit timeout contract; the implementation plan must choose and justify that window instead of leaving it implicit
- keep the proof model explicit and inspectable rather than implicit timing guesswork

### Browser-visible state model

- surface restart lifecycle states clearly in the browser
- distinguish "request accepted" from "daemon returned"
- show a bounded failure state when the daemon does not come back within the supported expectation window
- define how the browser re-establishes trust after the API disappears and then returns
- keep one restart vocabulary across onboarding, layout banners, `/config`, and any reconnect toast or status surface

### Existing restart surfaces

- upgrade current restart buttons, banners, and copy to the new truthful round-trip model
- avoid inventing separate restart vocabularies between onboarding, layout banners, and `/config`

## Planning Constraints Before Ticketing

- The implementation plan must name the durable proof artifact or state record that represents a restart request and its eventual satisfaction. For this phase, that artifact is `.pirate-claw/runtime/restart-proof.json`.
- The implementation plan must define the browser reconnection path after the current daemon exits, including what the UI shows while the API is unavailable. For this phase, the browser should keep using the existing server-load plus client-polling model and poll `GET /api/daemon/restart-status` until proof appears or the timeout expires.
- The implementation plan must choose the timeout that converts `restarting` into `failed_to_return` and explain why that window matches the supported Synology contract. For this phase, the timeout is 45 seconds.
- Ticket decomposition should keep proof semantics, browser state transitions, and restart-surface copy aligned; splitting those into unrelated slices would recreate the drift that Phase 24 just removed.

## Explicit Deferrals

- Mac always-on deployment work (Phase 26)
- broad UX/UI polish outside restart flows (Phase 27)
- v1 release/versioning ceremony (Phase 28)
- full hot reload of restart-backed settings
- general supervisor abstraction beyond what the supported deployment docs already cover
- widening the durable state boundary beyond the shipped Phase 24 contract

## Exit Condition

An operator can trigger a restart from the browser and receive a truthful end-to-end result that distinguishes accepted request, in-progress restart, successful return, and failed return, without opening a shell to verify what happened.

## Rationale

Phase 24 makes the underlying Synology restart contract real. That is necessary, but not sufficient for a trustworthy browser experience. As long as the browser only knows that it sent a restart request before the daemon disappeared, Pirate Claw is still asking the operator to infer success from hope and page refreshes. Phase 25 closes that gap by turning restart into an observable product flow rather than a blind side effect.
