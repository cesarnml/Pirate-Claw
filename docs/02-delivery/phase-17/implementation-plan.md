# Phase 17 Implementation Plan

Phase 17 adds the first-run guidance layer on top of the Phase 16 config-editing surface. Phase 14 and Phase 16 already provide the write endpoints and unified `/config` UX; Phase 17 uses that existing write path to guide a new operator through the first feed and first target, then makes empty states across the UI explicit and actionable.

## Epic

- `Phase 17 Onboarding and Empty State Experience`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-17-onboarding-and-empty-state.md`](../../01-product/phase-17-onboarding-and-empty-state.md)

## Grill-Me decisions locked for this phase

- **Two-track phase shape:** onboarding and empty states are separate delivery tracks within one phase. Do not create a mixed “foundation” ticket that touches both without landing a real user-visible slice.
- **Auto-trigger rule:** onboarding auto-launches only for the strict initial-empty case: no feeds AND no TV shows AND no movie years. Once any of those exist, the app does not auto-redirect into onboarding again.
- **Dismiss/resume rule:** dismissing onboarding suppresses future auto-redirects until the operator explicitly resumes onboarding from the main UI.
- **Incremental saves:** onboarding persists work step-by-step. Feed step saves feeds. Target step saves TV and/or movie targets. Done step is summary-only.
- **TV target preservation:** onboarding appends to `tv.shows` and preserves any existing shows already on disk.
- **Movie policy preservation:** onboarding preserves existing movie policy. It may seed movie resolutions/codecs/codecPolicy only when the current movie policy is effectively empty.
- **Write-disabled behavior:** if config writes are disabled in the web app, onboarding does not launch; the route shows a blocked state instead of a fake wizard.
- **Resume affordance:** after the initial-empty case, partially configured installs surface a prominent “Resume onboarding” CTA instead of forced redirects.
- **Onboarding route ownership:** auto-trigger logic belongs on `/`, while manual resume affordances appear on both `/` and `/config`.
- **Empty-state split:** route-level empty states (`/shows`, `/movies`, `/candidates/unmatched`, `/config`) ship separately from dashboard empty states and home/config onboarding affordances.
- **Fixture snapshots:** onboarding tickets depend on `GET /api/config`-driven route logic. Before dependent UI work begins, commit real fixture snapshots for the onboarding states this phase uses: at minimum an empty config snapshot and a partial-config snapshot with a saved feed but no targets.

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Existing config read/write flow in [`src/api.ts`](../../../src/api.ts)
- Existing config route and server actions in [`web/src/routes/config/`](../../../web/src/routes/config/)
- Existing dashboard and route load patterns in [`web/src/routes/`](../../../web/src/routes/)
- Existing API fixtures in [`fixtures/api/`](../../../fixtures/api/)

## Ticket Order

1. `P17.01 Onboarding Shell, Trigger Rules, and First Feed Save`
2. `P17.02 Onboarding TV Target Save`
3. `P17.03 Onboarding Movie Target Save and Both Flow`
4. `P17.04 Onboarding Done Step, Completion Gate, and Resume Polish`
5. `P17.05 Route-Level Empty State Alignment`
6. `P17.06 Dashboard Empty States and Onboarding Affordances`
7. `P17.07 Docs and Phase Exit`

## Ticket Files

- `ticket-01-onboarding-shell-feed-save.md`
- `ticket-02-onboarding-tv-target.md`
- `ticket-03-onboarding-movie-target-and-both-flow.md`
- `ticket-04-onboarding-done-summary-resume.md`
- `ticket-05-route-empty-state-alignment.md`
- `ticket-06-dashboard-empty-states-and-affordances.md`
- `ticket-07-docs-and-phase-exit.md`

## Exit Condition

A new operator can copy the starter config, start the daemon, open the browser, complete first-run setup without editing JSON, and then navigate a UI whose empty states explain what to do next instead of rendering as silent blanks. Manual config-first operators are not trapped in onboarding and can resume it explicitly if they want.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior or tradeoff changes
- onboarding fixture snapshots are committed before any dependent UI ticket begins
- the user-visible route/copy contract from earlier tickets remains stable

## Explicit Deferrals

- new daemon/API endpoints
- daemon-less onboarding or direct file writes from the web process
- feed suggestions, media-name suggestions, or disk auto-discovery
- onboarding for Transmission credentials or multi-user scenarios
- illustrations, decorative empty states, or broader visual redesign outside the phase scope
- real-time refresh or background polling changes

## Stop Conditions

Pause for review if:

- the onboarding route cannot reuse the existing config write endpoints without introducing a new API contract
- preserving TV shows or movie policy requires changing Phase 14/16 write semantics rather than using them correctly
- route-trigger behavior requires persistent storage beyond local browser/session state in a way that changes the product contract
- empty-state CTA placement starts forcing a broader dashboard or config-page layout refactor

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 17 ticket docs are merged to `main` and explicitly approved for delivery.

## Delivery status

Delivered on `main` via `P17.01`-`P17.07` stacked delivery.
