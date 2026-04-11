# P15.05 Movies View — Filter Tabs, Genre Filter, Sort, and Progress

## Goal

Enhance the Movies view with client-side filter tabs, a genre filter dropdown (TMDB-powered), sort options, and progress bar + speed for actively downloading movies. Mirrors the approach from P15.04 for the Transmission join.

## Prerequisites

- P15.02 (transmission proxy endpoints) merged
- `fixtures/api/transmission-torrents.json` committed

## Scope

### `src/movie-api-types.ts`

Add two fields to `MovieBreakdown`:

```typescript
export type MovieBreakdown = {
  normalizedTitle: string;
  year?: number;
  resolution?: string;
  codec?: string;
  identityKey: string;
  status: string;
  lifecycleStatus?: string;
  queuedAt?: string;
  transmissionPercentDone?: number; // last reconciled percent (0–1)
  transmissionTorrentHash?: string; // join key for live Transmission stats
  tmdb?: TmdbMoviePublic;
};
```

### `src/api.ts` — `buildMovieBreakdowns`

Pass the new fields through:

```typescript
.map((c) => ({
  normalizedTitle: c.normalizedTitle,
  year: c.year,
  resolution: c.resolution,
  codec: c.codec,
  identityKey: c.identityKey,
  status: c.status,
  lifecycleStatus: c.lifecycleStatus,
  queuedAt: c.queuedAt,
  transmissionPercentDone: c.transmissionPercentDone,
  transmissionTorrentHash: c.transmissionTorrentHash,
}))
```

### `web/src/lib/types.ts`

Mirror the additions to `MovieBreakdown`:

```typescript
export type MovieBreakdown = {
  normalizedTitle: string;
  year?: number;
  resolution?: string;
  codec?: string;
  identityKey: string;
  status: CandidateStatus;
  lifecycleStatus?: string;
  queuedAt?: string;
  transmissionPercentDone?: number;
  transmissionTorrentHash?: string;
  tmdb?: TmdbMoviePublic;
};
```

### `web/src/routes/movies/+page.server.ts`

Load movies and transmission torrents in parallel. Fail open for torrents:

```typescript
const [moviesData, torrentsData] = await Promise.allSettled([
  apiFetch<{ movies: MovieBreakdown[] }>('/api/movies'),
  apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents'),
]);

return {
  movies: moviesData resolved value or [],
  torrents: torrentsData resolved value or [],
  error: null or error string,
};
```

### `web/src/routes/movies/+page.svelte`

**Filter tabs** (client-side, reactive with `$state()`):

- All | Downloading | Completed | Failed | Missing
- "Missing" tab: `lifecycleStatus === 'missing_from_transmission'`
- "Downloading": `lifecycleStatus === 'downloading'`
- "Completed": `lifecycleStatus === 'completed'`
- "Failed": `status === 'failed'`
- Tab counts shown in parentheses

**Genre filter dropdown**:

- Populated from `movies.flatMap(m => m.tmdb?.genres ?? [])` — deduplicated, sorted
- Visible only when at least one movie has TMDB genre data
- "All genres" default; client-side filter applied on top of tab filter
- `TmdbMoviePublic` currently does not include a `genres` field — check `src/movie-api-types.ts`. If absent, skip the genre filter in P15 and note it in rationale. Do not add TMDB fields not already in the type.

**Sort** (client-side, reactive with `$state()`):

- Date added (default, desc by `queuedAt`)
- Title (A–Z)
- Year (desc)
- Resolution

**Movie cards** — add to existing card layout:

- Progress bar when `transmissionPercentDone > 0 && transmissionPercentDone < 1`
- Live speed: join `movie.transmissionTorrentHash` to `torrents` from the page data. Display `rateDownload` as MB/s or KB/s when `status === 'downloading'`
- ETA: formatted as "Xh Ym" or "—" when eta is -1
- Status overlay chip (same color scheme as P15.03)
- Genre badge from `tmdb?.genres[0]` when available

### `web/src/routes/movies/movies.test.ts`

Update tests to cover:

- Filter tabs render correct counts; tab click filters the movie list
- Sort options reorder cards correctly
- Progress bar and speed rendered for downloading movie
- Genre filter hidden when no TMDB genre data; visible and functional when present
- Transmission unavailable (empty `torrents`): cards render without progress bar

## Out of Scope

- Server-side filtering query params
- Per-genre dedicated pages
- Genre multi-select

## Exit Condition

Movies view has filter tabs, sort, and progress/speed for active downloads. All client-side. Tests are green.

## Rationale

_(Update this section after implementation. In particular: whether `TmdbMoviePublic` includes a `genres` field — if not, document the genre filter deferral and what TMDB data would be needed to add it.)_
