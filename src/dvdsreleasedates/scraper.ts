import { loggedFetch } from '../http-log';

const DEFAULT_TIMEOUT_MS = 15_000;

// dvdsreleasedates.com publishes an editorial "Top Movies <year>" ranking —
// used as the Top Movies of Year source instead of TMDB popularity.desc,
// which tracks *current* watchlist/search buzz rather than a year's
// editorial significance (verified live while building this feature: TMDB's
// popularity sort for 2026 surfaced lower-profile titles ahead of bigger
// releases that dvdsreleasedates ranked correctly). Confirmed live: this is
// a single static HTML page per year, no JS rendering needed, exactly 100
// `<td class='dvdcell'>` entries, each carrying a real IMDb id in an href —
// which is what makes the combo approach work: scrape the rank/title/imdb-
// id hierarchy here, enrich every entry with TmdbHttpClient.findMovieByImdbId
// for rich media. See notes/public/movie-calendar-scope.md.
const DVDS_RELEASE_DATES_BASE = 'https://www.dvdsreleasedates.com';

export type ScrapedTopMovie = {
  rank: number;
  title: string;
  imdbId: string;
  /** Which physical/digital formats this entry already shows links for —
   * a free signal for "a quality torrent is plausibly out" the calendar
   * itself has to infer from a date estimate. */
  formats: { dvd: boolean; bluray: boolean; fourK: boolean };
};

const DVDCELL_MARKER = "class='dvdcell'>";
const TITLE_ANCHOR_RE = /<a style='color:#000;'[^>]*>([^<]+)<\/a>/;
const IMDB_ID_RE = /imdb\.com\/title\/(tt\d+)\//;
const FORMAT_LINK_RE = (label: string) =>
  new RegExp(`class='bold'[^>]*>${label}<`);

/**
 * Scrapes https://www.dvdsreleasedates.com/top-movies-<year>/ for its
 * ranked Top Movies list. Returns null on any failure (network, non-200,
 * or a page whose markup no longer matches this parser) — best-effort, no
 * retry, same posture as the EZTV/TPB/YTS clients. Returns [] only when the
 * page loaded but had no recognizable entries (distinct from null so a
 * caller can tell "the site changed its markup" apart from "not reachable
 * right now").
 */
export async function scrapeTopMovies(
  year: number,
  log: (message: string) => void,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ScrapedTopMovie[] | null> {
  const requestUrl = `${DVDS_RELEASE_DATES_BASE}/top-movies-${year}/`;
  console.log(`[dvdsreleasedates] scraping year=${year} url=${requestUrl}`);

  let response: Response;
  try {
    response = await loggedFetch(
      requestUrl,
      {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pirate-claw)' },
      },
      { source: 'dvdsreleasedates', label: `top-movies-${year}` },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`dvdsreleasedates request failed: ${message}`);
    console.error(`[dvdsreleasedates] request failed year=${year}: ${message}`);
    return null;
  }

  if (!response.ok) {
    const bodyPreview = await readBodyPreview(response);
    log(
      `dvdsreleasedates HTTP ${response.status} for year=${year}: ${bodyPreview}`,
    );
    console.error(
      `[dvdsreleasedates] request failed year=${year} status=${response.status} body=${JSON.stringify(bodyPreview)}`,
    );
    return null;
  }

  const html = await response.text();
  const entries = parseTopMoviesHtml(html);

  console.log(
    `[dvdsreleasedates] year=${year}: ${entries.length} entries parsed from ${html.length} bytes`,
  );
  if (entries.length === 0) {
    console.warn(
      `[dvdsreleasedates] zero entries parsed for year=${year} — page markup may have changed`,
    );
  }
  return entries;
}

/** Exported for direct unit testing against saved HTML fixtures, without a
 * live network call. */
export function parseTopMoviesHtml(html: string): ScrapedTopMovie[] {
  const chunks = html.split(DVDCELL_MARKER).slice(1);
  const entries: ScrapedTopMovie[] = [];

  for (const chunk of chunks) {
    const rankMatch = chunk.match(/^(\d+)</);
    const titleMatch = chunk.match(TITLE_ANCHOR_RE);
    const imdbMatch = chunk.match(IMDB_ID_RE);
    if (!rankMatch || !titleMatch || !imdbMatch) continue;

    // Each dvdcell's own markup runs until the next dvdcell marker (already
    // guaranteed by the split above) — format flags are only ever checked
    // within this one entry's chunk, so a later entry's format table can
    // never leak into an earlier one's result.
    entries.push({
      rank: Number(rankMatch[1]),
      title: decodeHtmlEntities(titleMatch[1]),
      imdbId: imdbMatch[1],
      formats: {
        dvd: FORMAT_LINK_RE('DVD').test(chunk),
        bluray: FORMAT_LINK_RE('Blu-ray').test(chunk),
        fourK: FORMAT_LINK_RE('4K').test(chunk),
      },
    });
  }

  return entries;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
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
