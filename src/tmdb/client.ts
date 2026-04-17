import { TMDB_API_BASE } from './constants';

const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_REQUEST_INTERVAL_MS = 55;

export type TmdbSearchMovieResult = {
  id: number;
  title: string;
  release_date?: string;
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
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { Accept: 'application/json' },
      });
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

  async getTvSeason(
    tvId: number,
    seasonNumber: number,
  ): Promise<TmdbTvSeasonDetails | null> {
    return this.getJson<TmdbTvSeasonDetails>(
      `/tv/${tvId}/season/${seasonNumber}`,
    );
  }
}
