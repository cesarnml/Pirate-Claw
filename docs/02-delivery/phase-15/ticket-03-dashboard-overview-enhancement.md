# P15.03 Dashboard Overview Enhancement

## Goal

Enhance the existing Overview dashboard (`/`) to surface active downloads, a candidate event log, summary stats, an archive commit grid, and a Transmission session header strip. All data is loaded on page load (manual refresh via browser reload). No real-time updates.

## Prerequisites

- P15.01 (outcomes endpoint) merged
- P15.02 (transmission proxy endpoints) merged
- `fixtures/api/transmission-torrents.json` and `fixtures/api/transmission-session.json` committed

## Scope

### `web/src/routes/+page.server.ts`

Load four data sources in parallel. Fail open for each — a failing call returns null/empty, not a page error:

```typescript
const [health, transmissionSession, transmissionTorrents, candidates] =
  await Promise.allSettled([
    apiFetch<DaemonHealth>('/api/health'),
    apiFetch<SessionInfo>('/api/transmission/session'),
    apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents'),
    apiFetch<{ candidates: CandidateStateRecord[] }>('/api/candidates'),
  ]);
```

Return:

- `health: DaemonHealth | null`
- `transmissionSession: SessionInfo | null`
- `transmissionTorrents: TorrentStatSnapshot[]`
- `candidates: CandidateStateRecord[]`
- `error: string | null` (set if health fails; health is the only hard dependency)

### `web/src/lib/types.ts`

Add new types (anchored to `fixtures/api/transmission-session.json`):

```typescript
export type TorrentStatSnapshot = {
  hash: string;
  name: string;
  status: 'downloading' | 'seeding' | 'stopped' | 'error';
  percentDone: number;
  rateDownload: number;
  eta: number;
};

export type SessionInfo = {
  version: string;
  downloadSpeed: number;
  uploadSpeed: number;
  activeTorrentCount: number;
};
```

### `web/src/routes/+page.svelte`

Replace the current Daemon card + Recent Runs table with the full dashboard layout:

**Header strip** (always shown when health loads):

- Daemon: uptime, startedAt, lastRunCycle, lastReconcileCycle (existing fields)
- Transmission: version, downloadSpeed, uploadSpeed, activeTorrentCount — from `transmissionSession`; render "Transmission unavailable" when `transmissionSession` is null

**Active Downloads section**:

- Filter `transmissionTorrents` where `status === 'downloading'`
- Show max 5 rows. Each row: TMDB poster thumbnail (from matching candidate's `tmdb?.posterUrl`; fallback: colored initial box using normalizedTitle first char), title (from matching candidate's `normalizedTitle`), progress bar (`percentDone * 100`%), download speed (`rateDownload` formatted as KB/s or MB/s), ETA (formatted as "Xh Ym" or "—" when eta is -1)
- Match torrents to candidates: `torrent.hash === candidate.transmissionTorrentHash`
- "View all" link → `/candidates` (Candidates page)
- Section hidden when `transmissionTorrents` is empty

**Event Log**:

- Last 10 candidates from `candidates` sorted by `updatedAt` desc
- Table: title | status chip | updatedAt
- Status chip colors: `queued` → blue, `completed` → green, `failed` → red, `skipped_duplicate` → slate, `skipped_no_match` → gray, `downloading` → cyan
- "No candidates yet" placeholder when empty

**Stats row** (derived client-side from `candidates`):

- Total tracked: `candidates.length`
- Completed this week: candidates where `lifecycleStatus === 'completed'` and `transmissionDoneDate` is within the last 7 calendar days (UTC)
- Failed: candidates where `status === 'failed'`
- Skipped (no match): `candidates.filter(c => c.status === 'skipped_no_match').length` — note: skipped_no_match candidates are not currently stored in candidate_state (they go to feed_item_outcomes); if this count is always 0, omit the stat rather than show misleading zeros. Document in rationale.

**Archive Commit grid**:

- Filter `candidates` where `lifecycleStatus === 'completed'`
- Sort by `transmissionDoneDate` desc
- Take 6
- Each card: TMDB poster (`tmdb?.posterUrl`; graceful placeholder "No poster" when TMDB unconfigured), title, `completedAt` date formatted as "MMM D, YYYY"
- Grid hidden when no completed candidates

### `web/src/routes/dashboard.test.ts`

Update existing test file with new mock shapes anchored to the fixture snapshots. Add tests for:

- Renders Transmission header strip when `transmissionSession` is populated
- Renders "Transmission unavailable" when `transmissionSession` is null
- Active Downloads renders max 5 rows; renders "View all" link to `/candidates`
- Active Downloads section hidden when `transmissionTorrents` is empty
- Event Log renders last 10 candidates sorted by updatedAt
- Stats row derived correctly (total, failed counts)
- Archive Commit grid renders top 6 completed, hidden when none
- Error state renders alert when health is null

## Out of Scope

- Real-time / WebSocket updates
- Clickable torrent rows (navigation to show/movie detail is P15.04/P15.05)
- Disk usage stats
- Candidates route filter state (`/candidates?filter=downloading` URL handling — just the link target)

## Exit Condition

The Overview dashboard renders all six sections. `transmissionSession` and `transmissionTorrents` fail gracefully when Transmission is unreachable. Tests are green anchored to fixture snapshots.

## Rationale

_(Update this section after implementation with any behavior or tradeoff changes discovered. In particular: whether `skipped_no_match` candidates are stored in `candidate_state` or only in `feed_item_outcomes` — this determines whether the "Skipped" stat in the stats row is meaningful.)_
