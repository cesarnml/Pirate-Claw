# P10.03 Show Detail View

## Goal

Implement the per-show detail page at `/shows/[slug]` backed by `GET /api/shows`, showing season and episode breakdown with download status per episode.

## Scope

- `src/routes/shows/[slug]/+page.server.ts`: call `GET /api/shows` via the shared server fetch helper; find the show matching the URL slug (URL-decoded show name, case-insensitive); return show data or a not-found flag when no match exists
- `src/routes/shows/[slug]/+page.svelte`:
  - show name as page heading
  - seasons as labeled sections
  - episodes as rows within each season: episode number, title (if available from candidates), lifecycle state, queued at / updated at timestamps
  - back link to `/candidates`
- not-found state: clearly worded message when slug has no matching show in API data
- error state: clearly worded message when the API is unreachable
- tests:
  - render with mock show data — assert show name heading and at least one season section
  - render with no matching show — assert not-found message is present
  - render with API error — assert error state message is present

## Out Of Scope

- TMDB episode titles or metadata (Phase 11)
- Linking from shows list index page (there is no `/shows` index — entry point is the candidates list link added in P10.02)

## Exit Condition

Clicking a TV candidate title on the candidates list navigates to the show detail page. Seasons and episodes render. A slug with no matching show shows the not-found state without crashing.
