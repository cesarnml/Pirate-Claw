import { loggedFetch } from '../http-log';
import { TMDB_API_BASE } from './constants';

const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_REQUEST_INTERVAL_MS = 55;

export type TmdbSearchMovieResult = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  vote_average?: number;
};

export type TmdbMovieDetails = {
  id: number;
  title: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number }[];
  release_date?: string;
  /** Unlike TV, TMDB returns this directly on /movie/{id} — no separate
   * external_ids call needed. Null/absent for many titles. */
  imdb_id?: string | null;
};

export type TmdbDiscoverMovieResult = {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  popularity?: number;
  vote_average?: number;
  original_language?: string;
  genre_ids?: number[];
};

// TMDB's own release_type taxonomy on /movie/{id}/release_dates (stable,
// publicly documented): 1 Premiere, 2 Limited Theatrical, 3 Theatrical,
// 4 Digital, 5 Physical, 6 TV. Digital/Physical are what "a good torrent is
// plausibly out" actually tracks — theatrical (3) is what a bare
// discover/movie release_date reports, which is why the calendar needs
// this separate call to tell the two apart.
export type TmdbReleaseDateEntry = {
  release_date: string;
  type: number;
};

export type TmdbReleaseDatesResponse = {
  results?: {
    iso_3166_1: string;
    release_dates: TmdbReleaseDateEntry[];
  }[];
};

export type TmdbFindResult = {
  movie_results?: TmdbSearchMovieResult[];
};

export type TmdbSearchTvResult = {
  id: number;
  name: string;
  first_air_date?: string;
};

export type TmdbTvDetails = {
  id: number;
  name: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  networks?: { name: string }[];
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number }[];
  first_air_date?: string;
  number_of_seasons?: number;
  seasons?: { season_number: number; episode_count: number }[];
  /** 'Returning Series' | 'Planned' | 'In Production' | 'Ended' | 'Canceled'
   * | 'Pilot' — TMDB's own documented vocabulary, not enumerated here since
   * pirate_claw only ever pattern-matches on 'Ended'/'Canceled'. */
  status?: string;
  in_production?: boolean;
};

export type TmdbDiscoverTvResult = {
  id: number;
  name: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  popularity?: number;
  vote_average?: number;
  original_language?: string;
  genre_ids?: number[];
};

export type TmdbTvSeasonDetails = {
  season_number: number;
  episodes?: {
    episode_number: number;
    name?: string;
    still_path?: string | null;
    air_date?: string;
    overview?: string;
  }[];
};

export class TmdbHttpClient {
  private lastRequestAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly log: (message: string) => void,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Reserves the next allowed request time so concurrent callers serialize. */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const scheduled = Math.max(
      this.lastRequestAt + MIN_REQUEST_INTERVAL_MS,
      now,
    );
    this.lastRequestAt = scheduled;
    const waitMs = scheduled - now;
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  private async getJson<T>(path: string, retry429 = 0): Promise<T | null> {
    await this.throttle();
    const url = `${TMDB_API_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(this.apiKey)}`;

    let response: Response;
    try {
      response = await loggedFetch(
        url,
        {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { Accept: 'application/json' },
        },
        { source: 'tmdb', label: path },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`tmdb request failed: ${path} (${message})`);
      return null;
    }

    if (response.status === 429) {
      const retryAfterRaw = response.headers.get('retry-after');
      const retryAfter =
        retryAfterRaw !== null ? Number(retryAfterRaw) : Number.NaN;
      const waitSec =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : Math.min(2 ** retry429, 32);
      this.log(`tmdb rate limited (429) on ${path}; waiting ${waitSec}s`);
      if (retry429 < 4) {
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        return this.getJson<T>(path, retry429 + 1);
      }
      return null;
    }

    if (!response.ok) {
      this.log(`tmdb HTTP ${response.status} for ${path}`);
      return null;
    }

    return (await response.json()) as T;
  }

  async searchMovie(
    query: string,
    year?: number,
  ): Promise<TmdbSearchMovieResult | null> {
    const q = encodeURIComponent(query);
    const y = year != null ? `&year=${year}` : '';
    const data = await this.getJson<{ results?: TmdbSearchMovieResult[] }>(
      `/search/movie?query=${q}${y}`,
    );
    const first = data?.results?.[0];
    return first ?? null;
  }

  async getMovie(movieId: number): Promise<TmdbMovieDetails | null> {
    return this.getJson<TmdbMovieDetails>(`/movie/${movieId}`);
  }

  /** Discovers movies with a release-date within [gte, lte] (YYYY-MM-DD),
   * sorted by popularity. Same month-bucketing rationale as discoverTv —
   * see src/tmdb/movie-calendar.ts. */
  async discoverMovie(
    gte: string,
    lte: string,
    page: number,
  ): Promise<TmdbDiscoverMovieResult[]> {
    const data = await this.getJson<{ results?: TmdbDiscoverMovieResult[] }>(
      `/discover/movie?primary_release_date.gte=${gte}&primary_release_date.lte=${lte}&sort_by=popularity.desc&include_adult=false&page=${page}`,
    );
    return data?.results ?? [];
  }

  /** US digital (type 4) or physical (type 5) release date, whichever is
   * earlier — both signal "a real torrent release is now plausible", not
   * just theatrical. Returns null when TMDB confirms it has neither yet
   * (common for a movie still in theaters), which callers fall back from to
   * a theatrical-date heuristic — and undefined when the call itself failed
   * (network error, timeout, exhausted 429 retries, bad/rotated key, 5xx;
   * getJson() collapses all of those to null internally, indistinguishable
   * from `data` here without this check). That distinction matters to the
   * caller: MovieReleaseDateCache caches a real `null` for a full TTL, but
   * must never do the same for a failed call — that would lock in "no
   * date" for an hour based on a transient TMDB hiccup, self-correcting
   * only once the TTL expires even after TMDB recovers. Fetched lazily,
   * per-movie, only when a calendar entry is actually rendered — not worth
   * append_to_response on every discover result. */
  async getUsDigitalOrPhysicalReleaseDate(
    movieId: number,
  ): Promise<string | null | undefined> {
    const data = await this.getJson<TmdbReleaseDatesResponse>(
      `/movie/${movieId}/release_dates`,
    );
    if (data === null) return undefined;
    const us = data.results?.find((r) => r.iso_3166_1 === 'US');
    if (!us) return null;
    const dates = us.release_dates
      .filter((entry) => entry.type === 4 || entry.type === 5)
      .map((entry) => entry.release_date.slice(0, 10))
      .sort();
    return dates[0] ?? null;
  }

  /** Looks up a TMDB movie by an external IMDb id — used by the Top Movies
   * of Year scraper (dvdsreleasedates gives an IMDb id per entry, not a
   * TMDB id) to enrich a scraped ranking with real TMDB metadata. */
  async findMovieByImdbId(
    imdbId: string,
  ): Promise<TmdbSearchMovieResult | null> {
    const data = await this.getJson<TmdbFindResult>(
      `/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`,
    );
    return data?.movie_results?.[0] ?? null;
  }

  async searchTv(query: string): Promise<TmdbSearchTvResult | null> {
    const q = encodeURIComponent(query);
    const data = await this.getJson<{ results?: TmdbSearchTvResult[] }>(
      `/search/tv?query=${q}`,
    );
    const first = data?.results?.[0];
    return first ?? null;
  }

  async getTv(tvId: number): Promise<TmdbTvDetails | null> {
    return this.getJson<TmdbTvDetails>(`/tv/${tvId}`);
  }

  /** Fetched separately (not append_to_response on getTv) since it's only
   * needed by the missing-episodes EZTV lookup — a rare, user-initiated
   * action — not the regular show enrichment path every show goes through. */
  async getTvExternalIds(tvId: number): Promise<{ imdbId: string } | null> {
    const data = await this.getJson<{ imdb_id?: string | null }>(
      `/tv/${tvId}/external_ids`,
    );
    return data?.imdb_id ? { imdbId: data.imdb_id } : null;
  }

  async getTvSeason(
    tvId: number,
    seasonNumber: number,
  ): Promise<TmdbTvSeasonDetails | null> {
    return this.getJson<TmdbTvSeasonDetails>(
      `/tv/${tvId}/season/${seasonNumber}`,
    );
  }

  /** Discovers TV series with a first-air-date within [gte, lte] (YYYY-MM-DD), sorted by popularity. */
  async discoverTv(
    gte: string,
    lte: string,
    page: number,
  ): Promise<TmdbDiscoverTvResult[]> {
    const data = await this.getJson<{ results?: TmdbDiscoverTvResult[] }>(
      `/discover/tv?first_air_date.gte=${gte}&first_air_date.lte=${lte}&sort_by=popularity.desc&include_adult=false&page=${page}`,
    );
    return data?.results ?? [];
  }
}
