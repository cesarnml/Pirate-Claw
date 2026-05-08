# P10.02 Candidates List View

## Goal

Implement the candidates list page backed by `GET /api/candidates`, with client-side sort and graceful empty/error states.

## Scope

- `src/routes/candidates/+page.server.ts`: call `GET /api/candidates` via the shared server fetch helper; return typed candidate array or an error flag when the API is unreachable
- `src/routes/candidates/+page.svelte`: table of all candidates with columns:
  - title
  - media type (`movie` / `tv`)
  - rule name
  - resolution
  - lifecycle state
  - queued at / updated at timestamps
- client-side sort by lifecycle state and media type — toggled by clicking column headers, no server round-trip
- each TV candidate title links to `/shows/[slug]` (slug is the show name, URL-encoded) — P10.03 adds the real content behind that route
- empty state: clearly worded message when the candidates array is empty
- error state: clearly worded message when the API is unreachable (load function returns error flag)
- tests:
  - render with mock candidates data — assert expected columns and at least one row
  - render with empty candidates array — assert empty state message is present
  - render with API error — assert error state message is present

## Out Of Scope

- Show detail page content (P10.03)
- Movie-specific grouping (that is the `/movies` endpoint; candidates list shows all types together)

## Exit Condition

The candidates page renders the full table, sorts without a page reload, and handles empty and error states without crashing. Each TV candidate title links to its show detail route.
