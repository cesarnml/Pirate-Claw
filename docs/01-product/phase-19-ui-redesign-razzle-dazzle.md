# Phase 19: UI/UX Redesign ("Razzle-Dazzle")

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-19/` implementation plan until tickets are approved.

## TL;DR

**Goal:** Elevate the web UI from a functional-but-flat ops dashboard to a visually premium, poster-forward media command center. Adopt the Obsidian Tide design language from the version2 reference designs. Restructure navigation to a left sidebar, absorb Candidates and Unmatched into Dashboard, and surface existing API data (movie backdrops, Phase 18 Plex state) that the current UI leaves on the table.

**Ships:** Obsidian Tide design tokens; left sidebar layout with mobile drawer; redesigned Dashboard, TV Shows, TV Show Detail, Movies, and Config views; consolidated navigation (4 top-level routes); movie backdrops surfaced from existing API.

**Defers:** New daemon API endpoints; new intake behavior; new config surface beyond what Phases 13–18 delivered.

---

Phase 19 is the v1 UI/UX milestone. It makes Pirate Claw look as good as it works. No new daemon surface — every visual improvement draws from data the API already returns.

## Design Contract

The reference designs live in `tmp/pirate-claw-designs/version2-from-claude-detailed-prompt/` (6 screenshots: design system sheet, Dashboard, TV Shows, TV Show Detail, Movies, Config). These are the implementation target for visual language and layout density. The copy and branding use "Pirate Claw" throughout — "Sovereign Command" and "Obsidian Tide" are the design system's internal names, not the app's.

### Design system: Obsidian Tide palette

Replace the current `oklch`-based design tokens in `web/src/app.css` with the following:

| Token            | Value                  | Role                                             |
| ---------------- | ---------------------- | ------------------------------------------------ |
| Background       | `#0F172A`              | Page and sidebar background                      |
| Card / surface   | `#1E293B`              | Cards, panels, table rows                        |
| Border           | `#334155`              | Dividers, input outlines                         |
| Primary accent   | `#14B8A6`              | Interactive elements, active nav, progress bars  |
| Secondary accent | `#10ECE8`              | Highlights, active states, completion indicators |
| Tertiary accent  | `#0DBAF9`              | Info chips, tertiary badges                      |
| Destructive      | `#EF4444`              | Error states, failure chips                      |
| Warning          | `#F59E0B`              | Warning chips, WANTED / MISSING states           |
| Text primary     | `#F1F5F9`              | Headings, labels                                 |
| Text muted       | `#94A3B8`              | Secondary metadata, timestamps                   |
| Font             | Inter (already in use) | All text                                         |

Status chips use the operational style from the reference: uppercase, monospace-accented, color-coded. Examples: `ACTIVE`, `COMPLETED`, `QUEUED`, `SKIPPED_NO_MATCH`, `FAILED`, `IN_LIBRARY`, `MISSING`, `WANTED`.

## Committed Scope

### Layout restructure

- Replace the current top-nav + `max-w-5xl` centered column with a **persistent left sidebar + content area** layout
- Sidebar width: `~220px` on desktop; collapses to an icon-only `~64px` rail on medium viewports; full-screen drawer on mobile (triggered by hamburger)
- Sidebar sections: app logo/name at top; 4 nav items (icons + labels); system status at bottom (daemon uptime, Transmission connection indicator)
- Content area: fills remaining width; `max-w` removed — layouts can use full available width
- Responsive breakpoints: `lg` = persistent expanded sidebar; `md` = icon rail; `sm` and below = hidden sidebar with drawer trigger

### Navigation consolidation

The current 6-destination nav collapses to 4:

| Old route       | New route           | Notes                                                 |
| --------------- | ------------------- | ----------------------------------------------------- |
| `/` (Dashboard) | `/` (Dashboard)     | Expanded; absorbs Candidates + Unmatched              |
| `/candidates`   | removed             | Content absorbed into Dashboard Active Downlink panel |
| `/unmatched`    | removed             | Content absorbed into Dashboard Event Log panel       |
| `/shows`        | `/shows` (TV Shows) | Redesigned                                            |
| `/movies`       | `/movies` (Movies)  | Redesigned                                            |
| `/config`       | `/config` (Config)  | Redesigned                                            |

### Per-view targets

#### Dashboard (`/`)

Matches the Overview Dashboard reference screenshot:

- **Stat bar:** 4 stat cards — Total Tracked, Weekly Completed, Critical Failures, Filtered/Skipped
- **Active Downlink panel** (left column): active Transmission downloads with poster thumbnail, title, resolution/codec tag, speed, ETA, progress bar — replaces the `/candidates` route
- **Event Log panel** (right column): recent pirate-claw outcomes (COMPLETED, QUEUED, SKIPPED_NO_MATCH, FAILED, SKIPPED_DUPLICATE) as a dense table with title, feed source, status chip, and timestamp — absorbs the `/unmatched` route's unmatched-candidate signal into a unified activity stream
- **Archive Commit strip** (bottom): horizontal poster strip of recently completed downloads, linking to show/movie detail; modeled after the "ARCHIVE COMMIT" section in the reference

#### TV Shows (`/shows`)

Matches the TV Shows View reference screenshot:

- Poster-card grid replacing the current list; TMDB art as the card visual
- Per-card: poster, show title, TMDB rating badge, season/episode count, completion progress bar (teal), network badge (HBO, FX, APPLE TV+, etc.)
- Inline expanded state for the active/selected show: season tabs, per-episode rows with episode still, title, spec tags (resolution, codec), status chip, download speed + progress — matches the accordion detail in the reference
- Sort controls: Title, Rating, Progress, Recently Added
- If Phase 18 Plex data is available: `IN_LIBRARY` / `MISSING` chip on each card

#### TV Show Detail (`/shows/[slug]`)

Matches the TV Show Detail reference screenshot:

- Full-width hero section: TMDB backdrop image (already in API) as background with dark overlay gradient; poster, show title in large display type, season/episode count, TMDB rating, origin network, overview text
- Season tab strip with per-season episode table: episode thumbnail still, episode title, specs (resolution, codec, air date), status chip, Transmission progress bar (if active), Plex watch count chip (if Phase 18 configured)
- Refresh TMDB button (existing functionality, restyled)

#### Movies (`/movies`)

Matches the Movies View reference screenshot:

- Poster-card grid (replacing the current row-list layout)
- Per-card: poster image, **backdrop image as card background** (already in API as `backdropUrl` — currently unused on this view), title, year, resolution/codec spec tags, status chip (DOWNLOADING with %, WANTED, MISSING), Plex library status chip (if Phase 18 configured)
- Filter tabs: All / Downloading / Missing / Wanted
- Sort: Date Added, Title, Year
- "Add New" placeholder card at end of grid (routes to Config → movie policy)

#### Config (`/config`)

Matches the System Configuration reference screenshot:

- Replace the current long single-column accordion with a **four-panel card grid**:
  - `01 · TRANSMISSION PROTOCOL` — host, port, RPC version, auth token (masked), test connection button
  - `02 · RSS INGESTION HUBS` — feed list as a compact tag-style list with type badges (TV_SHOWS, MOVIES) and remove buttons; add-feed inline form at bottom
  - `03 · TV SERIAL PARAMETERS` — target resolutions (pill toggles), preferred codecs (pill toggles), active watchlist (tag chips for each tracked show)
  - `04 · MOVIE ACQUISITION POLICIES` — release year range, required specs (codec/resolution toggles), constraint level (PREFER / REQUIRE toggle)
- System metrics footer row: storage pool, transfer rate, CPU load, uptime — sourced from `/api/health` + `/api/status`
- Write-access indicator chip (top right): `WRITE ACCESS: ACTIVE` (teal) or `WRITE ACCESS: RESTRICTED` (muted) — replaces current read-only banners
- All existing write behavior (ETag, bearer token, validation toasts) preserved; only presentation changes

### API surface constraint

Zero new daemon endpoints. Phase 19 surfaces only data already returned by existing routes:

- `backdropUrl` on movies: present in `TmdbMovieMeta` and returned by `/api/movies` but not rendered in the current Movies view — Phase 19 uses it as card background
- `plexStatus`, `watchCount`, `lastWatchedAt`: delivered by Phase 18; Phase 19 renders them as chips on TV Shows, TV Show Detail, and Movies views
- All other data (stats, candidates, outcomes, config) already returned by existing endpoints

## Explicit Deferrals

- New daemon API endpoints of any kind
- New config fields or intake behavior
- Dark/light theme toggle (Obsidian Tide dark is the single theme in v1)
- Advanced animations or page transitions beyond standard Svelte transitions
- Onboarding wizard visual redesign (Phase 17 wizard is retouched for the new design tokens but not re-architected)
- Mobile-native app or PWA manifest

## Exit Condition

The web UI adopts Obsidian Tide visual language across all routes. Left sidebar navigation is in place and functional on desktop and mobile. Candidates and Unmatched are no longer top-level routes; their data surfaces in the redesigned Dashboard. Movie backdrops render on the Movies grid. If Phase 18 is configured, Plex status chips appear on TV Shows, TV Show Detail, and Movies views. All existing read and write functionality continues to work.

## Retrospective

`required` — Phase 19 restructures the operator navigation surface, absorbs two routes, and establishes the v1 visual contract. The design decisions made here (sidebar structure, view consolidation, design token system) are durable and will constrain future phases.

## Rationale

Phase 10 deferred "visually rich styling or theming." Phase 12 delivered a design system baseline (shadcn-svelte). Phases 13–17 added substantial functional surface. The cumulative result is a capable but visually flat admin tool that doesn't reflect the quality of what runs underneath it. Phase 19 closes that gap before v1. The reference designs demonstrate that the data pirate-claw already collects (TMDB posters, backdrops, ratings, download progress, lifecycle status) can produce a genuinely premium interface — the bottleneck is presentation, not data.
