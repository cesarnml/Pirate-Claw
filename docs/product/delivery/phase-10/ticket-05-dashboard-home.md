# P10.05 Dashboard Home

## Goal

Implement the dashboard home page at `/` backed by `GET /api/health` and `GET /api/status`, showing daemon run summary and candidate lifecycle stats.

## Scope

- `src/routes/+page.server.ts`: call `GET /api/health` and `GET /api/status` in parallel via the shared server fetch helper; return combined summary data or an error flag when either API call fails
- `src/routes/+page.svelte`:
  - daemon summary: last run time, total run count, success/failure breakdown from recent run history
  - candidate stats: total candidates grouped by lifecycle state
  - links to `/candidates` and `/config`
  - error state: clearly worded message when the API is unreachable
- tests:
  - render with mock health + status data — assert last run time and at least one lifecycle state stat are present
  - render with API error — assert error state message is present

## Out Of Scope

- Individual run history list (the candidates page covers detailed state)
- Real-time updates (polling on page load is sufficient for this phase)

## Exit Condition

The home page shows daemon run summary and candidate lifecycle stats. Both nav destination links (`/candidates`, `/config`) are present. All four nav destinations work end-to-end in-browser against the running daemon. The full phase 10 exit condition is met: an operator can navigate between home, candidates, show detail, and config views in a browser and see live data.
