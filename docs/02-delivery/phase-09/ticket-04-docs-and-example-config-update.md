# P9.04 Docs And Example Config Update

## Goal

Update user-facing docs and example config to document the new `runtime.apiPort` config field and the daemon HTTP API endpoints.

## Scope

- Add `runtime.apiPort` to `pirate-claw.config.example.json`
- Update `README.md` to document the daemon HTTP API (endpoints, example curl usage, config field)
- Update `docs/00-overview/start-here.md` to reflect Phase 09 as delivered
- Update `docs/00-overview/roadmap.md` Phase 09 section to reflect delivered status
- Verify `docs/README.md` index if a new durable doc path was added

## Out Of Scope

- Code changes — this ticket is docs-only

## Exit Condition

An operator reading the README can understand how to enable the daemon HTTP API, what endpoints are available, and what JSON shapes to expect. The example config shows the `apiPort` field. Start-here and roadmap reflect Phase 09 as delivered.

## Rationale

- Added `runtime.apiPort` to example config with value `3000` as a sensible development default.
- README receives a full "Daemon HTTP API" section with endpoint table, example curl/response, and guidance on when the listener starts. Placed between the daemon usage section and the current scope section.
- start-here.md updated from "through Phase 08" to "through Phase 09" and the delivered surface list includes all 7 API endpoints.
- roadmap.md Phase 09 moves from "planned, not yet implemented" to "implemented on main" with the full committed scope including review-driven refinements (skip incomplete TV candidates, reuse isDueFeed, credential redaction).
- docs/README.md index gets `phase-09/implementation-plan.md` entry.
