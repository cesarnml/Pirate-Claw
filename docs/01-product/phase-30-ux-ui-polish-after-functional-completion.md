# Phase 30: UX/UI Polish After Functional Completion

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-30/` implementation plan until tickets are approved.

Phase 30 is intentionally sequenced after the release-critical Synology install, owner security, and OpenVPN bridge work in Phases 27–29. Pirate Claw should finish the functional product-completion path first: DSM-first Synology cold start, owner web security, OpenVPN-hardened bundled Transmission, bootstrap, browser-only setup, dependable Plex auth lifecycle handling, truthful restart proof, and first-class always-on deployment. Only then should the next major phase polish the release surface.

## TL;DR

**Goal:** refine the interface after the product is functionally complete, without confusing visual polish for readiness.

**Ships:** release-critical trust, clarity, responsive, and visual polish across onboarding, install health, security posture, VPN status, config, dashboard, Movies, and TV Shows once the functional setup path is already solid.

**Defers:** any missing functional setup, security, VPN, packaging, or release ceremony work that belongs in Phases 21–29 or Phase 31.

## Phase Goal

Phase 30 should leave Pirate Claw in a state where:

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

- new setup/bootstrap/security/VPN functionality that should have landed in Phases 21–29
- major backend/API expansion justified only by aesthetics
- feature-set expansion unrelated to usability and polish
- another full visual redesign or information architecture reset

## Exit Condition

Pirate Claw is already functionally complete for DSM-first Synology cold start, owner web security, OpenVPN-hardened bundled Transmission, first-run bootstrap, browser-only setup, Plex auth lifecycle handling, restart proof, and always-on deployment on its supported reference platforms; Phase 30 then leaves the interface more cohesive, polished, and trustworthy without changing the core product contract.

## Rationale

Previous visual phases improved the interface while meaningful setup and deployment gaps still remained. Phase 30 deliberately keeps polish after the release-critical install, security, and downloader-network work. The product should first earn the right to be polished by being complete where it matters: zero hand-edited files, browser-only setup, DSM-first Synology installation, owner web security, OpenVPN-hardened bundled Transmission, dependable Plex auth lifecycle handling, truthful restart proof, and dependable always-on deployment on supported platforms.
