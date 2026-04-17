# P19.05 TV Show Detail redesign

## Goal

Redesign the TV Show Detail page (`/shows/[slug]`) to match the TV Show Detail
reference screenshot: a full-width TMDB backdrop hero section and a season
tab strip with per-episode rows.

## Scope

- **`web/src/routes/shows/[slug]/+page.svelte`:** full rebuild
  - **Full-width hero section:**
    - TMDB backdrop image (already returned by `/api/shows/[slug]`) as
      background with a dark overlay gradient
    - Poster thumbnail, show title in large display type, season/episode count,
      TMDB rating, origin network, overview text
  - **Season tab strip:** one tab per season; active tab highlights with primary
    accent
  - **Per-episode table** (active season):
    - Episode thumbnail still
    - Episode title
    - Spec tags: resolution, codec, air date
    - `StatusChip` (imported from `lib/components/StatusChip.svelte`)
    - Transmission progress bar when a download is active
    - Plex watch count chip when `watchCount` is non-null
  - **Refresh TMDB button:** existing functionality, restyled to Obsidian Tide

## Out Of Scope

- Any change to the `/api/shows/[slug]` response shape
- New daemon API endpoints
- Plex chip when `watchCount` is null or absent

## Exit Condition

The detail page renders the backdrop hero with TMDB art and metadata. Season
tabs switch the episode table correctly. Episode rows display spec tags and
`StatusChip` values. A Plex watch count chip appears when `watchCount` is
non-null. The Refresh TMDB button triggers the existing refresh action without
regression.

## Rationale

Separating this from P19.04 isolates the backdrop hero pattern (a new
full-width image treatment) from the inline card expansion on the list view.
The episode table row also introduces the Plex watch count chip, which is
distinct from the `IN_LIBRARY` / `MISSING` chips on the list view.

Approved scope exception: this ticket now owns the minimal API expansion needed
to match the design contract. That includes show-level TMDB network metadata,
episode-level spec tags already present in candidate state, and a
write-authenticated manual TMDB refresh action for the detail route.
