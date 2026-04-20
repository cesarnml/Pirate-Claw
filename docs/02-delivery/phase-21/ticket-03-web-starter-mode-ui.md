# P21.03 Web App Starter Mode UI

## Goal

Make the browser show a meaningful starter-mode state on fresh install instead of a broken or empty dashboard.

## Scope

- Fetch `GET /api/setup/state` once on app load (e.g. in a root layout `load` function or equivalent SvelteKit entry point)
- Expose setup state to all routes that need it (store or layout data)
- When `state === "starter"`: render a clear "Pirate Claw is not yet configured" UI — a banner, splash, or dedicated empty state; not the normal dashboard
- When `state === "partially_configured"`: render normal UI with a visible incomplete-setup indicator (banner or nav badge is sufficient)
- When `state === "ready"`: render normal UI with no setup-state indicator
- No polling — setup state is fetched once per page load

## Out Of Scope

- Full onboarding wizard or step-by-step setup flow (P22)
- Config field editing from the starter-mode UI (P22)
- Plex connectivity error surfacing (P22)

## Exit Condition

Fresh install (starter config) shows a distinct starter-mode UI. Configured install shows the normal dashboard. `partially_configured` shows normal UI with an incomplete indicator. No regressions on existing pages.

## Blocked By

P21.02 — `GET /api/setup/state`

## Rationale

- Fetching once on load avoids polling complexity while still giving the operator accurate state on every page navigation.
- Keeping starter-mode UI intentionally minimal (banner/splash, not a wizard) preserves P22 as the owner of the full onboarding flow. P21 only needs the browser to correctly distinguish "fresh install" from "working install."
