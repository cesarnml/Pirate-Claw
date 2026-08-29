import { loggedFetch } from '../http-log';

const DEFAULT_TIMEOUT_MS = 15_000;

// yts.gg is the current live continuation of the YTS/YIFY movie-torrent API
// — the original yts.mx/YIFY brand was shut down by the MPA in 2015; this
// mirror's own docs page (https://yts.gg/api) is literally titled "API
// Documentation - YTS YIFY". Confirmed live while building this feature:
// GET https://yts.gg/api/v2/movie_details.json?imdb_id=<id> returns a real
// movie object with a structured torrents[] array (quality/codec/size/seeds
// declared, not parsed from a title). No auth required.
//
// Like EZTV (see eztv/client.ts), this is a single hardcoded host with no
// mirror-fallback machinery — yts.gg's own response already carries a
// "Base URL moving to https://movies-api.accel.li/api/v2/" migration
// notice, which is exactly the kind of churn EZTV's client comment
// anticipates: when this host dies, swap the constant, don't build
// multi-mirror infrastructure this feature doesn't need yet.
const YTS_API_BASE = 'https://yts.gg/api/v2';

export type YtsTorrent = {
  /** yts.gg has no per-torrent numeric id, only a hash — this is a
   * deterministic small int derived from the hash so the shape still lines
   * up with TorrentSearchResult (see web/src/lib/types.ts) without adding
   * an id field the whole call chain would have to special-case. */
  id: number;
  title: string;
  magnetUrl: string;
  infoHash: string;
  sizeBytes: number;
  seeds: number;
  peers: number;
  /** Declared by YTS directly (e.g. "1080p"), not parsed from a title. */
  resolution: string;
  /** Declared by YTS directly (e.g. "x264"), not parsed from a title. */
  codec: string;
};

type YtsTorrentRaw = {
  hash?: string;
  quality?: string;
  type?: string;
  video_codec?: string;
  seeds?: number;
  peers?: number;
  size_bytes?: number;
};

type YtsMovieDetailsResponse = {
  status?: string;
  data?: {
    movie?: {
      title_long?: string;
      torrents?: YtsTorrentRaw[];
    };
  };
};

// Public trackers appended to every constructed magnet — yts.gg's
// torrent-download URL requires visiting the site (not a bare magnet), so a
// magnet is built the same way thepiratebay/client.ts does, from the
// declared info hash alone.
const KNOWN_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
];

/**
 * Thin yts.gg client, mirroring ThePirateBayHttpClient's shape and error
 * posture (best-effort, no retry — a rare user-initiated lookup). Unlike
 * apibay, this is an IMDb-id-keyed structured lookup with declared quality
 * fields per torrent, not a full-text title search.
 */
export class YtsHttpClient {
  constructor(
    private readonly log: (message: string) => void,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Returns null on any failure (network, non-200, malformed body, no
   * match for this IMDb id) — best-effort, no retry. Returns [] only when
   * YTS confirms the movie but it has no torrents listed. */
  async search(imdbId: string): Promise<YtsTorrent[] | null> {
    const requestUrl = `${YTS_API_BASE}/movie_details.json?imdb_id=${encodeURIComponent(imdbId)}`;
    console.log(`[yts] searching imdbId=${imdbId} url=${requestUrl}`);

    let response: Response;
    try {
      response = await loggedFetch(
        requestUrl,
        { signal: AbortSignal.timeout(this.timeoutMs) },
        { source: 'yts', label: 'movie_details.json' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`yts request failed: ${message}`);
      console.error(`[yts] request failed imdbId=${imdbId}: ${message}`);
      return null;
    }

    if (!response.ok) {
      const bodyPreview = await readBodyPreview(response);
      this.log(
        `yts HTTP ${response.status} for imdbId=${imdbId}: ${bodyPreview}`,
      );
      console.error(
        `[yts] request failed imdbId=${imdbId} status=${response.status} body=${JSON.stringify(bodyPreview)}`,
      );
      return null;
    }

    const rawText = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`yts response parse failed: ${message}`);
      console.error(
        `[yts] parse failed imdbId=${imdbId}: ${message} body=${JSON.stringify(truncate(rawText))}`,
      );
      return null;
    }

    const parsed = body as YtsMovieDetailsResponse;
    if (parsed.status !== 'ok' || !parsed.data?.movie) {
      // A movie with no YTS release at all is a legitimate, common outcome
      // (this is the whole reason manual backfill exists) — log at info,
      // not error, and return [] rather than null so callers don't treat a
      // real "nothing here" as a transient failure worth retrying.
      console.log(
        `[yts] no movie found for imdbId=${imdbId} (status=${parsed.status ?? 'missing'})`,
      );
      return [];
    }

    const rawTorrents = parsed.data.movie.torrents ?? [];
    const title = parsed.data.movie.title_long ?? imdbId;
    const torrents = rawTorrents
      .map((raw) => toYtsTorrent(raw, title))
      .filter((t): t is YtsTorrent => t !== null);

    console.log(
      `[yts] imdbId=${imdbId} title="${title}": ${rawTorrents.length} raw -> ${torrents.length} parsed`,
    );
    return torrents;
  }
}

async function readBodyPreview(response: Response): Promise<string> {
  try {
    return truncate(await response.text());
  } catch (error) {
    return `<failed to read body: ${error instanceof Error ? error.message : String(error)}>`;
  }
}

function truncate(text: string, maxLength = 500): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** A stable small positive int from a hex info hash, for the id field
 * TorrentSearchResult expects — collisions are harmless here (id is only
 * used as a Svelte #each key and a grab-button pending-state marker, both
 * scoped to one rendered results list). */
function hashToId(infoHash: string): number {
  let h = 0;
  for (let i = 0; i < infoHash.length; i++) {
    h = (h * 31 + infoHash.charCodeAt(i)) >>> 0;
  }
  return h;
}

function toYtsTorrent(raw: YtsTorrentRaw, title: string): YtsTorrent | null {
  if (!raw.hash || !raw.quality) return null;
  const label = raw.type
    ? `${title} [${raw.quality} ${raw.type}]`
    : `${title} [${raw.quality}]`;
  return {
    id: hashToId(raw.hash),
    title: label,
    magnetUrl: buildMagnetUrl(raw.hash, label),
    infoHash: raw.hash,
    sizeBytes: typeof raw.size_bytes === 'number' ? raw.size_bytes : 0,
    seeds: typeof raw.seeds === 'number' ? raw.seeds : 0,
    peers: typeof raw.peers === 'number' ? raw.peers : 0,
    resolution: raw.quality,
    codec: raw.video_codec ?? '',
  };
}

function buildMagnetUrl(infoHash: string, name: string): string {
  const trackerParams = KNOWN_TRACKERS.map(
    (tracker) => `&tr=${encodeURIComponent(tracker)}`,
  ).join('');
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackerParams}`;
}
