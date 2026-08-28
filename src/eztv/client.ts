import { loggedFetch } from '../http-log';

const DEFAULT_TIMEOUT_MS = 15_000;

// Confirmed live against the real API while building this feature:
// GET https://eztvx.to/api/get-torrents?imdb_id=0903747 (Breaking Bad, no
// "tt" prefix) returns { torrents_count, torrents: [...] }. A single mirror
// host, no fallback — see EztvHttpClient's class doc for why.
const EZTV_API_BASE = 'https://eztvx.to/api';

export type EztvTorrent = {
  id: number;
  title: string;
  filename: string;
  magnetUrl: string;
  season: number;
  episode: number;
  sizeBytes: number;
  seeds: number;
  peers: number;
  dateReleasedUnix: number;
};

type EztvGetTorrentsResponse = {
  torrents_count?: number;
  torrents?: {
    id?: number;
    title?: string;
    filename?: string;
    magnet_url?: string;
    season?: string;
    episode?: string;
    size_bytes?: number;
    seeds?: number;
    peers?: number;
    date_released_unix?: number;
  }[];
};

/**
 * Thin EZTV client, mirroring TmdbHttpClient's shape. Best-effort only: no
 * retry/backoff (this is a rare, user-initiated lookup for one missing
 * episode, not a background loop that needs to survive unattended — a
 * transient failure just means the user sees an error and can click again),
 * and a single hardcoded host with no mirror fallback (kept as one named
 * constant so swapping it later, if eztvx.to ever goes dark, is a one-line
 * change rather than new multi-mirror infrastructure this feature doesn't
 * need yet).
 */
export class EztvHttpClient {
  constructor(
    private readonly log: (message: string) => void,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Looks up all torrents EZTV has for a show (by IMDB id, digits only, no
   * "tt" prefix), optionally narrowed to one season+episode. Returns null on
   * any failure (network, non-200, malformed body) — best-effort, no retry. */
  async getTorrents(
    imdbId: string,
    filter?: { season?: number; episode?: number },
  ): Promise<EztvTorrent[] | null> {
    const numericImdbId = imdbId.replace(/^tt/i, '');
    console.log(`[eztv] looking up torrents imdbId=${numericImdbId}`);

    let response: Response;
    try {
      response = await loggedFetch(
        `${EZTV_API_BASE}/get-torrents?imdb_id=${encodeURIComponent(numericImdbId)}&limit=100&page=1`,
        { signal: AbortSignal.timeout(this.timeoutMs) },
        { source: 'eztv', label: 'get-torrents' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`eztv request failed: ${message}`);
      console.error(
        `[eztv] request failed imdbId=${numericImdbId}: ${message}`,
      );
      return null;
    }

    if (!response.ok) {
      this.log(`eztv HTTP ${response.status} for imdb_id=${numericImdbId}`);
      console.error(
        `[eztv] request failed imdbId=${numericImdbId} status=${response.status}`,
      );
      return null;
    }

    let body: EztvGetTorrentsResponse;
    try {
      body = (await response.json()) as EztvGetTorrentsResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`eztv response parse failed: ${message}`);
      console.error(`[eztv] parse failed imdbId=${numericImdbId}: ${message}`);
      return null;
    }

    const torrents = (body.torrents ?? [])
      .map(toEztvTorrent)
      .filter((t): t is EztvTorrent => t !== null)
      .filter((t) => {
        if (filter?.season !== undefined && t.season !== filter.season) {
          return false;
        }
        if (filter?.episode !== undefined && t.episode !== filter.episode) {
          return false;
        }
        return true;
      });

    console.log(
      `[eztv] found ${torrents.length} matching torrent(s) (of ${body.torrents?.length ?? 0} total) for imdbId=${numericImdbId}`,
    );
    return torrents;
  }
}

function toEztvTorrent(raw: {
  id?: number;
  title?: string;
  filename?: string;
  magnet_url?: string;
  season?: string;
  episode?: string;
  size_bytes?: number;
  seeds?: number;
  peers?: number;
  date_released_unix?: number;
}): EztvTorrent | null {
  const season = Number(raw.season);
  const episode = Number(raw.episode);
  if (
    raw.id === undefined ||
    !raw.title ||
    !raw.magnet_url ||
    !Number.isFinite(season) ||
    !Number.isFinite(episode)
  ) {
    return null;
  }
  return {
    id: raw.id,
    title: raw.title,
    filename: raw.filename ?? raw.title,
    magnetUrl: raw.magnet_url,
    season,
    episode,
    sizeBytes: raw.size_bytes ?? 0,
    seeds: raw.seeds ?? 0,
    peers: raw.peers ?? 0,
    dateReleasedUnix: raw.date_released_unix ?? 0,
  };
}
