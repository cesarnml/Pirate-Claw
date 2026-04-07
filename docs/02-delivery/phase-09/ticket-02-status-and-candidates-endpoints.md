# P9.02 Status, Health, And Candidates Endpoints

## Goal

Wire `GET /api/health`, `GET /api/status`, and `GET /api/candidates` into the daemon HTTP server so external consumers can query daemon health, recent run history, and full candidate state.

## Scope

- Implement `GET /api/health` returning `{ uptime: number, startedAt: string, lastRunCycle: CycleSnapshot | null, lastReconcileCycle: CycleSnapshot | null }` where `CycleSnapshot` contains `status`, `startedAt`, `completedAt`, `durationMs`
  - Track cycle results via the existing `onCycleResult` callback — no new daemon plumbing
  - This endpoint doubles as a Docker `HEALTHCHECK` target for the Synology deployment
- Implement `GET /api/status` returning `{ runs: RunSummaryRecord[] }` — recent runs with outcome counts, same data as `pirate-claw status` but as JSON
- Implement `GET /api/candidates` returning `{ candidates: CandidateStateRecord[] }` — full candidate state list ordered by `updatedAt` descending
- Both status and candidates endpoints read from the repository using the existing `listRecentRunSummaries()` and `listCandidateStates()` query methods
- Return `Content-Type: application/json` with consistent JSON error shapes for server errors
- The daemon must hold the database connection open for the API server's lifetime (not open/close per request)
- Add integration tests: health endpoint returns expected shape with cycle snapshots, status and candidates return expected JSON shapes, 404 for unknown routes still works, error handling for database failures

## Out Of Scope

- `/api/shows`, `/api/movies`, `/api/feeds`, and `/api/config` endpoints (P9.03)
- Pagination or filtering query parameters
- Docs/example config update (P9.04)

## Exit Condition

`curl http://localhost:<port>/api/health` returns daemon uptime and last cycle snapshots. `curl http://localhost:<port>/api/status` returns a JSON array of recent runs with counts. `curl http://localhost:<port>/api/candidates` returns a JSON array of candidate state records. All endpoints work while the daemon is running its normal cycle loop.
