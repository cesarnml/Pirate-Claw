# P19.03 Dashboard redesign

## Goal

Redesign the Dashboard (`/`) to match the Overview Dashboard reference
screenshot. Absorb the content from the `/candidates` and `/candidates/unmatched`
routes into the Dashboard, then delete those routes. Build the shared
`StatusChip` component used by this and subsequent view tickets.

## Scope

- **`web/src/lib/components/StatusChip.svelte`:** new shared component
  - Uppercase, monospace-accented, color-coded chips
  - Full vocabulary: `ACTIVE`, `COMPLETED`, `QUEUED`, `SKIPPED_NO_MATCH`,
    `FAILED`, `IN_LIBRARY`, `MISSING`, `WANTED`
  - Color mapping follows the Obsidian Tide palette (primary accent for active
    states, warning for WANTED/MISSING, destructive for FAILED)

- **`web/src/routes/+page.svelte`:** full rebuild
  - **Stat bar:** 4 stat cards — Total Tracked, Weekly Completed, Critical
    Failures, Filtered/Skipped; sourced from existing `/api/status` +
    `/api/outcomes` data
  - **Active Downlink panel** (left column): active Transmission downloads with
    poster thumbnail, title, resolution/codec tag, speed, ETA, progress bar;
    replaces the content currently at `/candidates`; sourced from existing
    `/api/transmission/torrents` + `/api/candidates`
  - **Event Log panel** (right column): recent pirate-claw outcomes as a dense
    table — title, feed source, `StatusChip`, timestamp; absorbs the
    unmatched-candidate signal from `/candidates/unmatched`; sourced from
    existing `/api/outcomes`
  - **Archive Commit strip** (bottom): horizontal poster strip of recently
    completed downloads with TMDB poster art, linking to `/shows/[slug]` or
    `/movies`; sourced from existing `/api/outcomes` filtered to `COMPLETED`
    status

- **Route deletion:**
  - Remove `web/src/routes/candidates/+page.svelte`
  - Remove `web/src/routes/candidates/unmatched/+page.svelte`
  - Remove the `web/src/routes/candidates/` directory

## Out Of Scope

- TV Shows, TV Show Detail, Movies, or Config view changes (P19.04–P19.07)
- Any new daemon API endpoints

## Exit Condition

The Dashboard renders the stat bar, Active Downlink panel, Event Log panel, and
Archive Commit strip using existing API data. `StatusChip` renders correctly for
all vocabulary values. Navigating to `/candidates` or `/candidates/unmatched`
returns a SvelteKit 404. All data that was previously visible on `/candidates`
and `/candidates/unmatched` is present in the Dashboard panels.

## Rationale

Dashboard goes first in the view sequence because it owns the destructive route
removal — the sooner the orphaned routes from P19.02 are closed, the cleaner
the repo state. Building `StatusChip` here at the moment of first use keeps the
component grounded in real rendering context rather than as a disconnected
infrastructure PR.
