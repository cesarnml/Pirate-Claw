# P19.06 Movies redesign

## Goal

Redesign the Movies view (`/movies`) to match the Movies View reference
screenshot: a poster-card grid using the `backdropUrl` field (already returned
by `/api/movies` but currently unused) as the card background, with filter
tabs, sort controls, and Plex status chips.

## Scope

- **`web/src/routes/movies/+page.svelte`:** full rebuild
  - **Poster-card grid:** replaces the current row-list layout
  - **Per-card content:**
    - `backdropUrl` as the card background image (field is already present in
      the `/api/movies` response; this ticket surfaces it for the first time)
    - Poster image overlaid on the backdrop
    - Title, release year
    - Resolution / codec spec tags
    - `StatusChip` with `DOWNLOADING` (+ % complete), `WANTED`, or `MISSING`
      (imported from `lib/components/StatusChip.svelte`)
    - Plex `IN_LIBRARY` / `MISSING` chip when `plexStatus` is non-null
  - **Filter tabs:** All / Downloading / Missing / Wanted
  - **Sort controls:** Date Added, Title, Year
  - **"Add New" placeholder card** at the end of the grid; routes to
    `/config` (movie policy section)

## Out Of Scope

- Any change to the `/api/movies` response shape
- New daemon API endpoints
- Plex chip when `plexStatus` is null or absent

## Exit Condition

The Movies grid renders with `backdropUrl` as card backgrounds wherever the
field is non-null. Filter tabs correctly narrow the grid. Sort controls reorder
cards. `StatusChip` and Plex chips render as specified. The "Add New" card
navigates to `/config`. All existing movie management functionality continues to
work.

## Rationale

`backdropUrl` has been present in the API response since TMDB enrichment landed
but has never been used in the UI. This ticket closes that gap with zero API
changes — purely a frontend rendering decision. The backdrop pattern established
here is simpler than the full-width hero in P19.05 (card-sized background vs
full-bleed page header), so it ships after the Detail page rather than before.
