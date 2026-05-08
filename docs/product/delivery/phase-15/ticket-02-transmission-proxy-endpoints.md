# P15.02 Transmission Proxy Endpoints

## Goal

Add `GET /api/transmission/torrents` and `GET /api/transmission/session` to the daemon API. These proxy Transmission RPC calls and return pirate-claw-shaped responses. Fixture snapshots for both endpoints must be committed before any UI ticket reads them (P15.03, P15.04, P15.05).

## Scope

### New Types in `src/transmission.ts`

```typescript
export type TorrentStatSnapshot = {
  hash: string;
  name: string;
  status: 'downloading' | 'seeding' | 'stopped' | 'error';
  percentDone: number;
  rateDownload: number; // bytes/second
  eta: number; // seconds; -1 when unknown
};

export type FetchTorrentStatsResult =
  | { ok: true; torrents: TorrentStatSnapshot[] }
  | SubmissionFailure;

export type SessionInfo = {
  version: string;
  downloadSpeed: number; // bytes/second
  uploadSpeed: number; // bytes/second
  activeTorrentCount: number;
};

export type FetchSessionInfoResult =
  | { ok: true; session: SessionInfo }
  | SubmissionFailure;
```

Do **not** modify `TorrentSnapshot`, `LookupTorrentsResult`, or `lookupTorrentsInTransmission` — those serve the reconcile path and must remain stable.

### Status Code Mapping

Transmission integer `status` → string:

| Code                 | Mapped to       |
| -------------------- | --------------- |
| 4                    | `'downloading'` |
| 6                    | `'seeding'`     |
| 7                    | `'error'`       |
| 0, 1, 2, 3, 5, other | `'stopped'`     |

### New Functions in `src/transmission.ts`

**`fetchTorrentStats(config: TransmissionConfig, hashes: string[]): Promise<FetchTorrentStatsResult>`**

- Calls Transmission RPC `torrent-get` with `ids: hashes` (Transmission accepts hash strings as ids) and fields: `['id', 'name', 'hashString', 'status', 'percentDone', 'rateDownload', 'eta']`.
- Handles 409 session negotiation (same pattern as existing `lookupTorrentsInTransmission`).
- Maps `statusCode` integer to the string union above.
- Returns `{ ok: true, torrents: TorrentStatSnapshot[] }` on success.
- Returns a `SubmissionFailure` on network, HTTP, or RPC error.

**`fetchSessionInfo(config: TransmissionConfig): Promise<FetchSessionInfoResult>`**

- Fires two RPC calls in parallel: `{ method: 'session-get', arguments: {} }` and `{ method: 'session-stats', arguments: {} }`.
- Extracts `version` from `session-get` response (`arguments.version`).
- Extracts `downloadSpeed` (`arguments['download-speed']`), `uploadSpeed` (`arguments['upload-speed']`), and `activeTorrentCount` (`arguments['active-torrent-count']`) from `session-stats` response.
- If either call fails, returns `SubmissionFailure`.
- Returns `{ ok: true, session: SessionInfo }` on success.

### API Routes in `src/api.ts`

**`GET /api/transmission/torrents`**

1. Query `repository.listCandidateStates()`.
2. Filter to candidates with `transmissionTorrentHash !== undefined`.
3. If no candidates have a hash, return `{ torrents: [] }` immediately (no Transmission call).
4. Call `fetchTorrentStats(config.transmission, hashes)`.
5. If the Transmission call fails → `502 { "error": "transmission unavailable", "detail": "..." }`.
6. Build response: for each Transmission torrent, find the matching candidate by hash. Only return torrents that match a pirate-claw candidate.
7. Response: `{ torrents: TorrentStatSnapshot[] }`.

**`GET /api/transmission/session`**

1. Call `fetchSessionInfo(config.transmission)`.
2. If fails → `502 { "error": "transmission unavailable", "detail": "..." }`.
3. Response: `{ version, downloadSpeed, uploadSpeed, activeTorrentCount }`.

Both endpoints read `config.transmission` from the existing `ApiFetchDeps.config` — no changes to `ApiFetchDeps` are required.

### Fixture Snapshots

Commit before P15.03 begins:

**`fixtures/api/transmission-torrents.json`**

```json
{
  "torrents": [
    {
      "hash": "abc123def456abc123def456abc123def456abc1",
      "name": "Breaking.Bad.S01E01.720p.BluRay.x264",
      "status": "downloading",
      "percentDone": 0.42,
      "rateDownload": 1048576,
      "eta": 3600
    },
    {
      "hash": "bcd234ef0567bcd234ef0567bcd234ef0567bcd2",
      "name": "The.Shawshank.Redemption.1994.1080p.x265",
      "status": "seeding",
      "percentDone": 1.0,
      "rateDownload": 0,
      "eta": -1
    }
  ]
}
```

**`fixtures/api/transmission-session.json`**

```json
{
  "version": "3.00 (bb6b5a062ef)",
  "downloadSpeed": 2097152,
  "uploadSpeed": 524288,
  "activeTorrentCount": 3
}
```

### Tests

- `fetchTorrentStats`:
  - happy path: returns mapped `TorrentStatSnapshot[]` with correct status strings
  - status code mapping: code 4 → `'downloading'`, code 6 → `'seeding'`, code 7 → `'error'`, code 0 → `'stopped'`
  - 409 session negotiation handled
  - Transmission unreachable → returns `SubmissionFailure`
- `fetchSessionInfo`:
  - happy path: merges session-get + session-stats into `SessionInfo`
  - one RPC call fails → returns `SubmissionFailure`
- API handler `GET /api/transmission/torrents`:
  - no candidates with hash → `{ torrents: [] }`, no Transmission call made
  - Transmission fails → 502
  - happy path: only torrents matching pirate-claw candidates returned
- API handler `GET /api/transmission/session`:
  - Transmission fails → 502
  - happy path: correct `SessionInfo` shape

## Out of Scope

- Any web UI (P15.03–P15.05)
- Caching or rate-limiting of Transmission proxy calls
- Transmission write operations (throttle, ratio management)

## Exit Condition

Both endpoints are live. Tests are green. Both fixture snapshots are committed and readable by P15.03.

## Rationale

_(Update this section after implementation with any behavior or tradeoff changes discovered.)_
