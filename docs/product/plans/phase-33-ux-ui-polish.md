# Phase 33: UX/UI Polish

**Delivery status:** Not started — product definition only; no `docs/product/delivery/phase-33/` implementation plan until tickets are approved.

Phase 33 is intentionally sequenced after the release-critical work in Phases 27–32 is complete and stable. No new functionality belongs here. The product earns the right to be polished by being complete and stable first.

## TL;DR

**Goal:** refine the interface after the product is functionally complete and stable, without confusing visual polish for readiness.

**Ships:** release-critical trust, clarity, responsive, and visual polish across onboarding, install health, security posture, VPN status, config, dashboard, Movies, and TV Shows.

**Defers:** any missing functional setup, security, VPN, packaging, or release ceremony work that belongs in Phases 27–32 or Phase 34.

## Phase Goal

Phase 33 should leave Pirate Claw in a state where:

- functional setup is already complete before polish work begins
- operational surfaces are clearer, more legible, and more cohesive
- low-operational-value "collector shelf" views (Movies and TV Shows) feel intentional without stealing priority from setup and dashboard workflows
- design improvements serve trust and usability rather than masking incomplete product behavior
- install, security, and VPN status surfaces reduce operator doubt instead of adding decorative complexity

## Committed Scope

- onboarding and install-health flow polish after the functional setup contract is proven
- owner-login, direct-mode acknowledgement, and VPN-status clarity
- Config page UX refinement, copy cleanup, hierarchy tuning, and interaction smoothing
- dashboard readability and activity affordance polish
- Movies and TV Shows visual and interaction improvements as secondary, shelf-like views
- cross-surface consistency passes for toasts, validation copy, loading states, and empty states

## Explicit Deferrals

- new setup/bootstrap/security/VPN functionality that should have landed in Phases 21–32
- major backend/API expansion justified only by aesthetics
- feature-set expansion unrelated to usability and polish
- another full visual redesign or information architecture reset
- stabilization of regressions from Phases 28–32 (Phase 34)

## Exit Condition

Pirate Claw is already functionally complete for both Mac GUI and Synology DSM install paths, owner web security, OpenVPN-hardened bundled Transmission, first-run bootstrap, browser-only setup, Plex auth lifecycle handling, restart proof, PMS enrichment with TMDB fallback, and always-on deployment on all supported platforms; Phase 33 then leaves the interface more cohesive, polished, and trustworthy without changing the core product contract.

## Rationale

Previous visual phases improved the interface while meaningful setup and deployment gaps still remained. Phase 33 deliberately keeps polish after the release-critical install, security, downloader-network, and enrichment work. The product should first earn the right to be polished by being complete where it matters.
