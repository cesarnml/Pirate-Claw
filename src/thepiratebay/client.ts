import { loggedFetch } from '../http-log';

// Bumped from 15s after 2026-08-29 field data showed apibay.org sitting
// right at the old deadline often enough to matter (6 of 9 calls in one
// 21-minute window). A longer deadline is a slower coin-flip, not a more
// reliable one by itself — the UI-side retry button is what actually gets a
// second roll of the dice; this just gives any one attempt more room.
const DEFAULT_TIMEOUT_MS = 30_000;

// apibay.org is an unofficial JSON mirror of The Pirate Bay's catalog — used
// here as a fallback when EZTV's (much smaller, TV-only) catalog doesn't
// have a given episode. Confirmed live while building this feature:
// GET https://apibay.org/q.php?q=<query> returns a plain JSON array, no
// auth, no rate-limit headers observed.
const APIBAY_BASE = 'https://apibay.org';

// TPB's own category taxonomy (stable, publicly documented):
// 205 = TV shows (SD/other), 208 = TV shows (HD). Filtering to these two
// keeps movie/other-media false positives out of a title-only text search.
const TV_CATEGORIES = new Set(['205', '208']);

// 201 = Movies (SD/other), 207 = HD Movies. Same purpose as TV_CATEGORIES,
// for the movie-calendar manual-grab path. Confirmed live: querying apibay
// for a 2026 title returns real hits tagged 207.
const MOVIE_CATEGORIES = new Set(['201', '207']);

export type ThePirateBayMediaType = 'tv' | 'movie';

// apibay doesn't return a magnet link or .torrent file, only an info_hash —
// the caller has to construct the magnet URI itself. This is the same
// small set of long-lived public trackers most third-party TPB magnet
// generators append; without at least one tracker a magnet link with no
// seeds already known to the client can fail to ever find peers via DHT
// alone on a restrictive network.
const KNOWN_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
];

export type ThePirateBayTorrent = {
  id: number;
  title: string;
  magnetUrl: string;
  infoHash: string;
  sizeBytes: number;
  seeds: number;
  peers: number;
  addedUnix: number;
  /** Present when the uploader tagged it; not guaranteed. */
  imdbId: string | null;
};

/**
 * search()'s outcome, replacing a bare `T[] | null`. A caller (and
 * ultimately the end user) needs to tell "we gave up waiting" apart from
 * "apibay actively rejected/broke the request" — those call for different
 * copy ("try again" vs "check back later") and only one of them is honestly
 * describable as a timeout. `reason` stays coarse (two buckets, not four)
 * because that's the only distinction the UI currently acts on; the
 * `this.log`/console lines above already capture the finer-grained cause
 * (HTTP status, parse failure, etc.) for after-the-fact diagnosis.
 */
export type ThePirateBaySearchOutcome =
  | { ok: true; torrents: ThePirateBayTorrent[] }
  | { ok: false; reason: 'timeout' | 'error' };

type ApibayResult = {
  id?: string;
  name?: string;
  info_hash?: string;
  leechers?: string;
  seeders?: string;
  size?: string;
  category?: string;
  added?: string;
  imdb?: string;
};

/**
 * Thin apibay.org client, mirroring EztvHttpClient's shape and error
 * posture (best-effort, no retry — a rare user-initiated lookup, not a
 * background loop). Unlike EZTV, this is a plain full-text search with no
 * season/episode structured fields and no IMDB-keyed lookup — the caller
 * builds the query string (typically "<show name> S01E02").
 */
export class ThePirateBayHttpClient {
  constructor(
    private readonly log: (message: string) => void,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Returns `{ ok: false, reason }` on any failure (network, non-200,
   * malformed body) — best-effort, no retry. Returns `{ ok: true, torrents:
   * [] }` for a genuine no-match.
   *
   * Every branch below logs enough to diagnose a real failure after the
   * fact without reproducing it live: apibay is an unofficial, undocumented
   * mirror with no SLA, so "it returned nothing" needs to be distinguishable
   * from "the request never reached apibay," "apibay blocked/rate-limited
   * us," "apibay's response shape drifted," and "results came back but the
   * TV-category filter zeroed them out" — four very different follow-up
   * fixes. loggedFetch already records method/URL/status/timing for every
   * attempt to the persistent http.log; the console lines here are the
   * `docker logs`-visible complement for immediate triage. The `reason`
   * returned to the caller only distinguishes "we gave up at our own
   * deadline" (`timeout`) from everything else (`error`) — that's the one
   * distinction the UI currently needs to word its message honestly. */
  async search(
    query: string,
    mediaType: ThePirateBayMediaType = 'tv',
  ): Promise<ThePirateBaySearchOutcome> {
    const requestUrl = `${APIBAY_BASE}/q.php?q=${encodeURIComponent(query)}`;
    console.log(
      `[thepiratebay] searching query="${query}" mediaType=${mediaType} url=${requestUrl}`,
    );

    let response: Response;
    try {
      response = await loggedFetch(
        requestUrl,
        { signal: AbortSignal.timeout(this.timeoutMs) },
        { source: 'thepiratebay', label: 'q.php' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`thepiratebay request failed: ${message}`);
      console.error(
        `[thepiratebay] request failed query="${query}": ${message}`,
      );
      // AbortSignal.timeout() rejects with a DOMException named
      // "TimeoutError" — the one reliable way to tell "our own deadline
      // elapsed" apart from a genuine network failure (DNS, connection
      // reset, TLS failure, etc.), which surfaces under other names/types.
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? 'timeout'
          : 'error';
      return { ok: false, reason };
    }

    if (!response.ok) {
      // Body text (not just status) matters here: apibay/Cloudflare can
      // return a 403/503 with an HTML block page whose content explains
      // *why* (rate limit, WAF challenge, maintenance) — status code alone
      // doesn't distinguish those.
      const bodyPreview = await readBodyPreview(response);
      this.log(
        `thepiratebay HTTP ${response.status} for query="${query}": ${bodyPreview}`,
      );
      console.error(
        `[thepiratebay] request failed query="${query}" status=${response.status} body=${JSON.stringify(bodyPreview)}`,
      );
      return { ok: false, reason: 'error' };
    }

    const rawText = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`thepiratebay response parse failed: ${message}`);
      console.error(
        `[thepiratebay] parse failed query="${query}": ${message} body=${JSON.stringify(truncate(rawText))}`,
      );
      return { ok: false, reason: 'error' };
    }

    if (!Array.isArray(body)) {
      this.log(`thepiratebay response was not an array (got ${typeof body})`);
      console.error(
        `[thepiratebay] unexpected response shape query="${query}" type=${typeof body} body=${JSON.stringify(truncate(rawText))}`,
      );
      return { ok: false, reason: 'error' };
    }

    // Broken out per stage rather than one final count — a real-world
    // failure here is far more likely to be "results came back but got
    // filtered to zero" (sentinel row, or every hit landing in a category
    // outside TV_CATEGORIES) than a hard request/parse error above, and
    // those two causes need different follow-up fixes.
    const rawResults = body as ApibayResult[];
    const realResults = rawResults.filter(isRealResult);
    const allowedCategories =
      mediaType === 'movie' ? MOVIE_CATEGORIES : TV_CATEGORIES;
    const categoryResults = realResults.filter((raw) =>
      allowedCategories.has(raw.category ?? ''),
    );
    const torrents = categoryResults
      .map(toThePirateBayTorrent)
      .filter((t): t is ThePirateBayTorrent => t !== null);

    console.log(
      `[thepiratebay] query="${query}" mediaType=${mediaType}: ${rawResults.length} raw -> ${realResults.length} real (not the no-results sentinel) -> ${categoryResults.length} in ${mediaType} categories -> ${torrents.length} parsed`,
    );
    if (
      rawResults.length > 0 &&
      realResults.length > 0 &&
      categoryResults.length === 0
    ) {
      console.warn(
        `[thepiratebay] all ${realResults.length} real result(s) were filtered out by category for query="${query}" mediaType=${mediaType}; categories seen: ${JSON.stringify([...new Set(realResults.map((r) => r.category))])}`,
      );
    }
    return { ok: true, torrents };
  }
}

/** Best-effort text body for logging on a non-2xx response — a body read
 * can itself fail (already-consumed stream, network drop mid-body); never
 * let that mask the original HTTP-status failure. */
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

/** apibay's sentinel for "no results" is a single-element array with
 * id "0" and an all-zero info_hash — not an empty array. */
function isRealResult(raw: ApibayResult): boolean {
  return (
    raw.id !== '0' &&
    typeof raw.info_hash === 'string' &&
    !/^0+$/.test(raw.info_hash)
  );
}

function toThePirateBayTorrent(raw: ApibayResult): ThePirateBayTorrent | null {
  const id = Number(raw.id);
  if (!Number.isFinite(id) || !raw.name || !raw.info_hash) {
    return null;
  }
  return {
    id,
    title: raw.name,
    magnetUrl: buildMagnetUrl(raw.info_hash, raw.name),
    infoHash: raw.info_hash,
    sizeBytes: raw.size ? Number(raw.size) || 0 : 0,
    seeds: raw.seeders ? Number(raw.seeders) || 0 : 0,
    peers: raw.leechers ? Number(raw.leechers) || 0 : 0,
    addedUnix: raw.added ? Number(raw.added) || 0 : 0,
    imdbId: raw.imdb && raw.imdb.length > 0 ? raw.imdb : null,
  };
}

function buildMagnetUrl(infoHash: string, name: string): string {
  const trackerParams = KNOWN_TRACKERS.map(
    (tracker) => `&tr=${encodeURIComponent(tracker)}`,
  ).join('');
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackerParams}`;
}
