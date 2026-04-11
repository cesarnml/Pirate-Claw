# P15.04 TV Shows View — Progress and Sort

## Goal

Enhance the TV Shows view to show per-episode progress bars and live download speed for active episodes, add client-side sort (title / progress), and surface the `transmissionTorrentHash` join key through the `ShowEpisode` type.

## Prerequisites

- P15.02 (transmission proxy endpoints) merged
- `fixtures/api/transmission-torrents.json` committed

## Scope

### `src/tv-api-types.ts`

Add two fields to `ShowEpisode`:

```typescript
export type ShowEpisode = {
  episode: number;
  identityKey: string;
  status: string;
  lifecycleStatus?: string;
  queuedAt?: string;
  transmissionPercentDone?: number; // last reconciled percent (0–1)
  transmissionTorrentHash?: string; // join key for live Transmission stats
  tmdb?: TmdbTvEpisodeMeta;
};
```

### `src/api.ts` — `buildShowBreakdowns`

Pass the new fields from `CandidateStateRecord` when building episodes:

```typescript
seasonMap.get(season)!.push({
  episode: c.episode,
  identityKey: c.identityKey,
  status: c.status,
  lifecycleStatus: c.lifecycleStatus,
  queuedAt: c.queuedAt,
  transmissionPercentDone: c.transmissionPercentDone,
  transmissionTorrentHash: c.transmissionTorrentHash,
});
```

### `web/src/lib/types.ts`

Mirror the same additions to `ShowEpisode`:

```typescript
export type ShowEpisode = {
  episode: number;
  identityKey: string;
  status: CandidateStatus;
  lifecycleStatus?: string;
  queuedAt?: string;
  transmissionPercentDone?: number;
  transmissionTorrentHash?: string;
  tmdb?: TmdbTvEpisodeMeta;
};
```

### `web/src/routes/shows/+page.server.ts`

Load shows and transmission torrents in parallel. Fail open for torrents:

```typescript
const [showsData, torrentsData] = await Promise.allSettled([
  apiFetch<{ shows: ShowBreakdown[] }>('/api/shows'),
  apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents'),
]);

return {
  shows: showsData resolved value or [],
  torrents: torrentsData resolved value or [],
  error: null or error string,
};
```

### `web/src/routes/shows/+page.svelte`

**Show grid cards** — add sort control:

- Sort options: "Title (A–Z)" (default) and "Progress" (descending by max episode `transmissionPercentDone` across all seasons)
- Sort is client-side, reactive state with `$state()`
- Each card shows: TMDB poster (placeholder when unavailable), show title, episode count, completion % (completed episodes ÷ total episodes tracked; label omitted when 0 episodes tracked)

### `web/src/routes/shows/[slug]/+page.server.ts`

Same pattern: load `/api/shows` and `/api/transmission/torrents` in parallel. Pass both to the page.

### `web/src/routes/shows/[slug]/+page.svelte`

**Season accordion / episode rows**:

- For episodes where `lifecycleStatus === 'downloading'` (or `status === 'queued'` and `transmissionPercentDone > 0`): show progress bar using `transmissionPercentDone`
- For live speed: join `episode.transmissionTorrentHash` to `torrents` array from `GET /api/transmission/torrents`. Display `rateDownload` formatted as MB/s or KB/s, and ETA as "Xh Ym" or "—"
- TMDB still image thumbnail per episode when `episode.tmdb?.stillUrl` is available
- Status chip using existing color scheme from P15.03 (reuse the chip logic; extract to a shared Svelte snippet if both P15.03 and P15.04 need it)
- Episodes with no active download: show `transmissionPercentDone` as a static progress bar (last known percent from reconcile)

### Tests

- `web/src/routes/shows/shows.test.ts`: add test that progress bar renders for active episodes; sort control changes card order
- `web/src/routes/shows/[slug]/shows.test.ts`: add test that speed/eta row appears for active episodes; hidden for completed episodes
- `src/api.test.ts` or equivalent: `buildShowBreakdowns` passes through `transmissionPercentDone` and `transmissionTorrentHash`

## Out of Scope

- TMDB network badge (TMDB `networks` field not in current schema — defer)
- TMDB `totalEpisodes` completion ratio (requires TMDB episode count; not currently stored — omit the completion % if data is unavailable; never show 0/0)
- Per-season download in bulk

## Exit Condition

The TV Shows list has sort controls. The show detail page shows progress bars and live speed for active episodes joined from the transmission proxy. Tests are green.

## Rationale

_(Update this section after implementation with any behavior or tradeoff changes discovered. In particular: whether completion % is viable given the TMDB data available in the cache.)_
