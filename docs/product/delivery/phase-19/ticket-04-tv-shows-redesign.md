# P19.04 TV Shows redesign

## Goal

Redesign the TV Shows view (`/shows`) to match the TV Shows View reference
screenshot: a poster-card grid with TMDB art, per-card metadata, an inline
expanded state for the selected show, and sort controls.

## Scope

- **`web/src/routes/shows/+page.svelte`:** full rebuild
  - **Poster-card grid:** replaces the current list layout; TMDB poster art as
    the card visual
  - **Per-card content:**
    - Poster image
    - Show title
    - TMDB rating badge
    - Season / episode count
    - Teal completion progress bar
    - Network badge (HBO, FX, APPLE TV+, etc.) from existing API data
    - `IN_LIBRARY` / `MISSING` `StatusChip` when `plexStatus` is non-null
      (imported from `lib/components/StatusChip.svelte`)
  - **Inline expanded state:** clicking a card expands it in-place; expanded
    view shows:
    - Season tabs
    - Per-episode rows: episode still, title, spec tags (resolution, codec),
      `StatusChip`, download speed + progress bar (when active)
  - **Sort controls:** Title, Rating, Progress, Recently Added

## Out Of Scope

- TV Show Detail full-page view redesign (P19.05)
- Any new daemon API endpoints
- Plex chip when `plexStatus` is null or absent

## Exit Condition

The TV Shows grid renders with TMDB poster art. Clicking a card expands the
inline episode view with season tabs. Sort controls change the card order.
`IN_LIBRARY` / `MISSING` chips appear when `plexStatus` is non-null on an item.
All existing navigation to `/shows/[slug]` from the inline state or elsewhere
continues to work.

## Rationale

Keeping TV Shows and TV Show Detail as separate tickets isolates the inline
accordion behavior (this ticket) from the full-width hero and episode table
(P19.05). The shared `StatusChip` from P19.03 is imported here, not rebuilt.
