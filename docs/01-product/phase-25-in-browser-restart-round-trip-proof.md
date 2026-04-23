# Phase 25: In-Browser Restart Round-Trip Proof

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-25/` implementation plan until tickets are approved.

Phase 25 follows the Synology restart-durability contract from Phase 24. Once Pirate Claw can restart correctly under supervision, the browser should stop treating restart as a fire-and-forget hope and start showing a truthful restart journey with proof that the daemon actually came back.

## TL;DR

**Goal:** let the operator request a restart from the browser and observe a truthful round-trip result.

**Ships:** restart request tracking, browser-visible restart states, proof that a restarted daemon instance came back, and failure handling when the daemon does not return in time.

**Defers:** non-Synology platform deployment work, broader deployment packaging, and deep hot-reload redesign.

## Phase Goal

Phase 25 should leave Pirate Claw in a state where:

- the browser can request a restart without pretending success the moment the process exits
- the operator can observe at least `requested`, `restarting`, `back_online`, and `failed_to_return` outcomes
- restart completion is backed by a real proof signal from the restarted daemon instance
- restart-backed setup/config changes feel trustworthy because the product distinguishes "restart was requested" from "restart finished"

## Committed Scope

### Restart round-trip contract

- define a restart request identifier or equivalent proof mechanism that survives the handoff across process exit and supervisor restart
- let the restarted daemon expose enough state for the browser to confirm that the post-restart instance is the one that satisfied the request
- keep the proof model explicit and inspectable rather than implicit timing guesswork

### Browser-visible state model

- surface restart lifecycle states clearly in the browser
- distinguish "request accepted" from "daemon returned"
- show a bounded failure state when the daemon does not come back within the supported expectation window

### Existing restart surfaces

- upgrade current restart buttons, banners, and copy to the new truthful round-trip model
- avoid inventing separate restart vocabularies between onboarding, layout banners, and `/config`

## Explicit Deferrals

- Mac always-on deployment work (Phase 26)
- broad UX/UI polish outside restart flows (Phase 27)
- v1 release/versioning ceremony (Phase 28)
- full hot reload of restart-backed settings
- general supervisor abstraction beyond what the supported deployment docs already cover

## Exit Condition

An operator can trigger a restart from the browser and receive a truthful end-to-end result that distinguishes accepted request, in-progress restart, successful return, and failed return, without opening a shell to verify what happened.

## Rationale

Phase 24 makes the underlying Synology restart contract real. That is necessary, but not sufficient for a trustworthy browser experience. As long as the browser only knows that it sent a restart request before the daemon disappeared, Pirate Claw is still asking the operator to infer success from hope and page refreshes. Phase 25 closes that gap by turning restart into an observable product flow rather than a blind side effect.
