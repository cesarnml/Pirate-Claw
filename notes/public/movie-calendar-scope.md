Scope note for the Movie Calendar feature, settled via a `grill-me` discussion on 2026-08-29. This is vibe-code-direct-to-main work (per the standing override), not a numbered phase — no ticket decomposition, no PR process. Written so a future session doesn't have to reconstruct these decisions from scratch, and so `docs/product/plans/phase-36-library-gap-reconciliation-and-indexer-backfill.md` (drafted 2026-08-27, status: draft) isn't mistaken for current — this conversation supersedes its scope for the movie-calendar/manual-grab slice specifically. Phase 36 is broader (persisted expected-state ledger, automated three-way diff, downtime-aware trigger, EZTV-for-TV backfill too) and remains a real future option; what follows is the narrower slice actually being built now.

## What's shipping

**Rename (precursor):** `/calendar` → `/tv-calendar`, nav label "TV Calendar." No behavior change — just disambiguates before Movie Calendar exists.

**`/movie-calendar`:** TMDB `discover/movie`-backed browse view, mechanically a port of `src/tmdb/calendar.ts`'s `getTvCalendar` — month-bucketed fetch (same popularity-vs-date bias applies to movies as it does to TV), load-earlier button + infinite scroll, offset/limit pagination anchored on today.

**Grab action, not an "Add" action.** Movies aren't individually tracked the way TV shows are — `config.movies` is year+quality-rule policy ("grab anything from these years that clears the bar"), there's no `movies.titles[]` to append to. So a calendar entry has no "start tracking" concept to mirror TV Calendar's "Add Show." Instead each entry gets a **Grab** action that works like `/shows/[slug]`'s per-episode manual-grab panel: search apibay + YTS.gg, pick a torrent, queue straight to Transmission. Movie Calendar is TV Calendar's browse shell fused with `/shows/[slug]`'s grab mechanics — a chimera of the two existing patterns, not a new third pattern.

**Storage:** new `manual_grabs`-sibling table, movie-shaped — keyed on `tmdb_id` (no `season`/`episode`, unlike the existing TV table which has them `NOT NULL`). Store `imdb_id` too since YTS keys searches on it.

**Two movie torrent sources**, matching TV's EZTV+TPB precedent exactly:

- **apibay.org (The Pirate Bay)** — already integrated (`src/thepiratebay/client.ts`), just add movie categories (201 Movies, 207 HD Movies). Confirmed live via curl, occasional `imdb` field for exact matching.
- **YTS.gg** — this _is_ the current YIFY API (the original yts.mx/YIFY brand was shut down by the MPA in 2015; YTS.gg is a live continuation, its own docs page is literally titled "API Documentation - YTS YIFY"). Confirmed live via curl: `/api/v2/list_movies.json` and `/movie_details.json?imdb_id=...` return clean JSON, per-quality torrent list with hash/seeds/peers/size/codec, keyed on IMDb id directly.
- **No third source.** Looked for one: TorrentGalaxy and 1337x have no official JSON API (scrape-only), SolidTorrents is HTML-scrape-only (confirmed by reading searxng's actual scraper source — no documented API), RARBG is dead. Not worth the scrape-maintenance tax for a first pass.
- **Base URLs hardcoded**, same posture as EZTV today (see `src/eztv/client.ts`'s comment: single hardcoded host, no mirror-fallback machinery, swap the constant when it dies). Config-editable indexer URLs are a real gap — noted, deliberately deferred until mirror churn proves to be a recurring problem in practice, not hypothetical. Also blocked in spirit on verifying the existing daemon-restart-from-webui round-trip (`RestartDaemonBanner`, `restart-status` endpoint, `restart-proof.ts`) is actually reliable before trusting a UI-edited URL to take effect — that machinery already exists, just hasn't been stress-tested against this use case.

**Release-date badge:** lazy TMDB `/movie/{id}/release_dates` lookup (region=US, `release_type` 4=Digital/5=Physical) for the real date when TMDB has it, falling back to a theatrical+6–8wk heuristic badge when it doesn't. Confirms the "torrent-quality availability ≠ theatrical release date" nuance without guessing when real data exists.

**"Top Movies of Year" tab** (second tab on `/movie-calendar`, not a separate route): scrapes `dvdsreleasedates.com/top-movies-<year>/` rather than relying on TMDB popularity sort alone. Verified live: TMDB `discover/movie?sort_by=popularity.desc&primary_release_year=2026` and dvdsreleasedates' top 10 for the same year overlap but diverge meaningfully — TMDB popularity tracks _current_ watchlist/search buzz (surfaced things like "Facing El Chapo" and "Toxic: A Fairy Tale for Grown-ups" ahead of bigger titles), not a year's editorial significance. dvdsreleasedates scrapes cleanly: static HTML, no JS needed, exactly 100 ranked `<td class='dvdcell'>` entries per year, each carrying an IMDb `tt...` id directly in an `href` plus DVD/Blu-ray/4K format-availability flags (free signal for "is a quality torrent likely out yet"). Verified the full chain live: scraped IMDb id → TMDB `/find/{imdb_id}?external_source=imdb_id` → real TMDB movie object. Combo approach: scrape for the rank/title/imdb-id hierarchy, enrich every entry via TMDB for rich media (poster, overview, rating). Cached per year — no TTL for past years (settled history), manual "Rescan" button for the current year since it drifts through the year. Same Grab action as the main calendar view.

**Debug logging:** all three new/extended external-service paths (apibay movie-category queries, the new YTS client, the new dvdsreleasedates scraper) get the same explicit request/response/parse-failure logging posture as the existing EZTV/TPB/TMDB clients, so a layout change on any of these third parties surfaces immediately instead of silently returning zero rows.

## Explicitly not in this slice

- No persisted expected-state ledger, no automated three-way diff, no downtime-aware auto-trigger — that's Phase 36's broader "gap reconciliation engine" framing, deferred. This slice is human-driven: you look at the calendar, you notice a gap, you click Grab. Same posture as TV Calendar today.
- No `/movies/[slug]` detail route — the existing `/movies` wall stays as-is; Grab lives inline on calendar/top-movies entries.
- No config-editable torrent-source URLs (see above).
- No IMDb-id identity plumbing shared across TV, no EZTV-for-TV-backfill work — movie-only for now.

## Sequencing

All at once, in one vibe arc (deliberately chosen over shipping the core calendar first and layering in release-dates/top-movies-of-year later) — it's one coherent feature conceptually and the release-date nuance is the actual point of it, not an add-on.

## Later

Once the vibing pass on remaining user-facing features is done, write a full retrospective (format: `notes/public/phase-28-owner-web-security-retrospective.md`) covering whatever actually shipped across this stretch of work, not just this feature in isolation.
