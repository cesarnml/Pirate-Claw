# Phase 14: Feed Setup and Target Management MVP

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-14/` implementation plan until tickets are approved.

Phase 14 extends the Phase 13 write path to cover the remaining structural config sections — feeds, movies, and TV defaults — via the web UI. Phase 13 delivered the write token, ETag/If-Match, atomic write, and tv.shows management. Phase 14 builds directly on that infrastructure without touching its contracts.

## Phase Goal

Phase 14 should leave Pirate Claw in a state where:

- operators can add and remove RSS feeds (TV and movie) from the dashboard
- operators can add and remove TV show targets and manage the global TV codec/resolution defaults
- operators can manage movie years, resolutions, codecs, and codecPolicy from the dashboard
- the UI is visibly read-only when no write token is configured
- each config section is independently writable via its own endpoint — no single god route

## Committed Scope

### Daemon and API

Three new dedicated write endpoints, each gated by the same bearer token and ETag/If-Match contract established in Phase 13:

**`PUT /api/config/feeds`**
- replaces the `feeds` array in the config file atomically
- validates each feed entry using the existing `validateFeed` rules in `src/config.ts`
- performs a blocking HTTP fetch of each new feed URL before accepting the write:
  - HTTP 2xx response required; any other result rejects the PUT with 400
  - server-side timeout: 10 seconds per URL
  - existing feed URLs (already present on disk) are not re-fetched
- rejects the write if any new URL fails the fetch

**`PUT /api/config/tv/defaults`**
- replaces `tv.defaults` (resolutions and codecs) in the config file atomically
- validates using the existing `validateCompactTvDefaults` rules in `src/config.ts`
- per-show overrides already on disk are preserved (same `mergeTvShowsPreservingDiskEntries` pattern)
- does not touch `tv.shows`

**`PUT /api/config/movies`**
- replaces the `movies` policy (years, resolutions, codecs, codecPolicy) in the config file atomically
- validates using the existing `validateMoviePolicy` rules in `src/config.ts`
- `codecPolicy` is required in the request body (`'prefer' | 'require'`)

All three endpoints:
- require `Authorization: Bearer <token>`; 401 if missing, 403 if wrong
- require `If-Match` with the current ETag from `GET /api/config`; 428 if missing, 409 on conflict
- return the updated redacted config with a fresh ETag on success
- return 403 with `{ "error": "config writes are disabled" }` when no write token is configured

### Web (`web/`)

- **Feeds section**: add/remove feed entries (name, URL, mediaType); blocked with read-only state when write token absent
- **TV section**: manage the global defaults (resolutions, codecs multi-select) and the shows list (already exists from Phase 13)
- **Movies section**: manage years (add/remove), resolutions (multi-select), codecs (multi-select), codecPolicy (prefer/require toggle)
- all forms submit to SvelteKit server actions that proxy to the daemon; the write token never reaches browser JavaScript
- UI displays a visible read-only banner when write token is not configured (same pattern as Phase 13 Settings)

## Explicit Deferrals

These are intentionally outside Phase 14:

- per-show codec/resolution overrides (show-level rules beyond the global defaults)
- per-feed poll interval editing
- feed URL reachability suggestions or auto-retry on transient failures
- advanced movie policy (per-feed rules, per-year overrides)
- TLS, SSO, or auth beyond the Phase 13 bearer-on-write model

## Exit Condition

With write token configured, an operator can manage all feeds and core matching policy (TV defaults, movie policy, show targets) from the browser without touching the config file directly. CLI and direct file editing remain fully supported parallel paths.

## Rationale

Phase 13 proved the write pattern on a bounded subset (runtime + tv.shows). Phase 14 applies the same pattern to the remaining structural sections that operators change most often (feeds, movie years, codec preferences). Dedicated endpoints per section keep the write surface auditable and testable independently. Blocking feed-fetch validation is chosen over advisory because a feed URL that returns nothing will silently produce no results — catching it at save time is preferable to debugging a dead feed later.

## Implementation Notes

- reuse `validateFeed`, `validateCompactTvDefaults`, `validateMoviePolicy` from `src/config.ts` — do not duplicate validation logic
- the ETag is computed over the full redacted config (`buildConfigEtag` in `src/api.ts`); all three new endpoints read and return the same ETag so clients stay synchronized
- fixture snapshots for `GET /api/config` (feeds array populated, movies policy populated) must be added to the ticket spec before implementation of any UI ticket that reads these fields
- feed fetch timeout (10s) and HTTP 2xx validity definition must be explicit in the ticket spec for the feeds endpoint
