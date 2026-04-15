# Phase 18: Plex Media Server Enrichment

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-18/` implementation plan until tickets are approved.

## TL;DR

**Goal:** Close the loop between "downloaded by pirate-claw" and "in your Plex library / watched." Enrich the dashboard with real library state and watch history sourced from an optional Plex Media Server connection.

**Ships:** Optional `plex` config block; Plex HTTP API client; SQLite cache for Plex library state; background refresh timer; `plexStatus`, `watchCount`, and `lastWatchedAt` fields on `/api/shows` and `/api/movies`.

**Defers:** Intake gating based on Plex state; write operations to Plex; Jellyfin/Emby support; webhooks or push notifications from Plex.

---

Phase 18 is shaped identically to how Phase 11 introduced TMDB — a new optional external service, cached locally in SQLite, enriching the daemon API with display-only data. If Plex is not configured the daemon behaves exactly as before.

## Phase Goal

Phase 18 should leave Pirate Claw in a state where:

- operators who run Plex Media Server can connect it once via config and see library status and watch history alongside download state in the dashboard
- operators who do not run Plex see no change in behavior — all new fields default to `unknown`
- the Plex connection is read-only in all cases; pirate-claw never writes to or instructs Plex

## Committed Scope

### Config

A new optional top-level `plex` block in `pirate-claw.config.json`:

```json
{
  "plex": {
    "url": "http://192.168.1.10:32400",
    "token": "YOUR_PLEX_TOKEN",
    "refreshIntervalMinutes": 30
  }
}
```

- `url`: base URL of the local Plex Media Server (required if block is present)
- `token`: Plex authentication token (required if block is present); redacted in `/api/config` responses, same pattern as Transmission credentials
- `refreshIntervalMinutes`: how often the background refresh runs; defaults to `30`
- if the `plex` block is absent, all Plex-derived fields in API responses return `"unknown"` and no Plex connections are made

### Plex API client (`src/plex/`)

- read-only HTTP client against the Plex Media Server local API
- fetches library sections to locate TV and movie libraries
- fetches per-item metadata: title, year, `viewCount`, `lastViewedAt`, presence in library
- matching strategy: title + year (same approach as TMDB matching); fuzzy match with a configurable confidence threshold
- no Plex.tv cloud dependency — operates entirely against the local server URL

### SQLite cache

Two new tables, mirroring the TMDB cache pattern:

- `plex_tv_cache`: keyed by show title (normalized); stores `in_library` (boolean), `watch_count`, `last_watched_at`, `plex_rating_key`, `cached_at`
- `plex_movie_cache`: keyed by title + year; stores the same fields
- TTL: stale after `refreshIntervalMinutes * 2`; background refresh keeps data fresh; expired entries return `unknown` rather than erroring

### Background refresh

- new daemon timer `runPlexBackgroundRefresh` (parallel to `runTmdbBackgroundRefresh`)
- fires on startup (if Plex is configured) and then on the configured interval
- logs a warning and continues without Plex data if the server is unreachable — no daemon crash

### Enriched API responses

`/api/shows` and `/api/movies` gain three new optional fields per item:

| Field           | Type                    | Values                                          |
| --------------- | ----------------------- | ----------------------------------------------- |
| `plexStatus`    | string                  | `in_library` \| `missing` \| `unknown`          |
| `watchCount`    | number \| null          | total play count from Plex; `null` when unknown |
| `lastWatchedAt` | ISO 8601 string \| null | most recent play timestamp; `null` when unknown |

No new endpoints are added. The `/api/config` endpoint redacts `plex.token`.

## Explicit Deferrals

- **Intake gating:** `plexStatus` is display-only in v1. No `skipIfInLibrary` or similar intake filter.
- **Write operations:** pirate-claw never marks items watched, creates playlists, or modifies Plex state.
- **Jellyfin / Emby / Kodi:** Phase 18 is Plex-only. A generic media-library provider interface is a v2 consideration.
- **Plex.tv cloud auth:** Phase 18 uses a static local token only. OAuth or managed account flows are deferred.
- **Webhook / push updates:** Plex change events are not consumed. The background poll is the only sync mechanism in v1.
- **Per-season or per-episode Plex state:** Phase 18 enriches at the show and movie level. Episode-level watch state is deferred.

## Exit Condition

An operator with Plex configured sees `plexStatus: "in_library"` and a non-null `watchCount` on shows and movies present in their library. An operator without Plex configured sees `plexStatus: "unknown"` and `watchCount: null` on all items with no errors. The daemon starts, polls, and refreshes Plex data on the configured interval without blocking or crashing when Plex is unreachable.

## Retrospective

`required` — Phase 18 introduces a durable optional external-service boundary (Plex) that is structurally new to the system. The matching strategy, cache TTL policy, and "display-only in v1" constraint are all decisions future phases may revisit, and the learning should be recorded.

## Rationale

Pirate Claw downloads media for a Plex library. Today the dashboard shows download state but has no visibility into whether content actually landed in Plex or how much it has been watched. That gap makes the dashboard feel disconnected from the operator's real goal. Closing it requires only a read-only Plex API call and a local cache — the same pattern that made TMDB enrichment (Phase 11) feel like a natural extension rather than a new feature.

Keeping Plex as optional and display-only in v1 preserves the tool's identity as an intake pipeline rather than a media library manager, while still delivering real value to the common deployment profile (Synology NAS running both Transmission and Plex).
