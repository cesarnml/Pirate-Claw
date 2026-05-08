# P10.04 Config View

## Goal

Implement the config page at `/config` backed by `GET /api/config`, rendering the effective normalized config with Transmission credentials already redacted by the API.

## Scope

- `src/routes/config/+page.server.ts`: call `GET /api/config` via the shared server fetch helper; return typed config object or an error flag when the API is unreachable
- `src/routes/config/+page.svelte`:
  - render config as a structured key/value display (nested sections for top-level config groups: feeds, movies, tv, transmission, runtime)
  - Transmission credentials are absent — redacted upstream by the API, no special handling needed in the UI
  - error state: clearly worded message when the API is unreachable
- tests:
  - render with mock config data — assert at least one top-level config section heading is present
  - render with API error — assert error state message is present

## Out Of Scope

- Config editing (explicitly deferred for this phase)
- Displaying raw JSON (structured readable rendering is the goal)

## Exit Condition

The config page renders the effective normalized config in a readable structured layout. Transmission credentials are absent. The error state renders without crashing when the API is unreachable.
