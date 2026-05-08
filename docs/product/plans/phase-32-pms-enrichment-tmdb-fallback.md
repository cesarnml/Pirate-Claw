# Phase 32: PMS Enrichment and TMDB Fallback for Movies and Shows

**Delivery status:** Not started — product definition only; no `docs/product/delivery/phase-32/` implementation plan until tickets are approved.

Phase 32 expands TMDB enrichment coverage to the /movies and /shows pages, with Plex Media Server data as the primary enrichment source and TMDB as the fallback when PMS data is absent or insufficient. The dashboard TMDB enrichment introduced in earlier phases remains unchanged.

## TL;DR

**Goal:** make /movies and /shows feel like a media library, not a file list — using PMS as the primary enrichment source and TMDB as the fallback.

**Ships:** PMS-backed enrichment on /movies and /shows, TMDB fallback when PMS data is unavailable, and updated enrichment state indicators.

**Defers:** enrichment for dashboard/activity views (no change from current), write-back from TMDB to PMS, user-managed metadata overrides.

## Phase Goal

Phase 32 should leave Pirate Claw in a state where:

- /movies and /shows show PMS-sourced metadata (poster, title, year, summary) when Plex is connected and the item is matched
- TMDB fills the gap when PMS is not connected, the item is not yet matched in Plex, or PMS metadata is incomplete
- dashboard enrichment behavior is unchanged
- enrichment source is visible or inferable from the UI (PMS badge vs. TMDB badge, or equivalent)
- no enrichment call is made when both PMS and TMDB are unavailable — graceful degraded state

## Committed Scope

_To be defined during grill-me session before Phase 32 ticket creation._

Anticipated areas:

- enrichment priority chain: PMS first → TMDB fallback → bare file metadata
- enrichment source indicator on /movies and /shows cards/rows
- TMDB API call budget and caching strategy for /movies and /shows (separate from dashboard)
- behavior when Plex is connected but item is unmatched
- behavior when Plex is not configured

## Explicit Deferrals

- dashboard enrichment changes
- write-back of TMDB metadata into PMS
- user-overridable metadata
- enrichment for queue/activity items beyond what already exists
- TMDB enrichment for genres, cast, crew beyond poster/title/year/summary

## Exit Condition

/movies and /shows display enriched metadata for matched items using PMS data first and TMDB data as fallback. Unmatched or unenriched items degrade gracefully to file-level data. Dashboard enrichment is unchanged.

## Rationale

The dashboard uses TMDB-only enrichment, which is appropriate for the activity-focused use case. The /movies and /shows pages are library views where PMS is the authoritative source when available. TMDB fallback prevents the pages from feeling empty for owners who have not yet connected Plex or whose library is partially matched.
