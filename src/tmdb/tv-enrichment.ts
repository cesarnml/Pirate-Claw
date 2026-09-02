import type {
  ShowBreakdown,
  ShowEpisode,
  ShowSeason,
  TmdbTvEpisodeMeta,
  TmdbTvShowMeta,
} from '../tv-api-types';
import type { TmdbHttpClient } from './client';
import type { TmdbCache, TmdbTvCacheRow } from './cache';
import { backdropUrl, posterUrl, stillUrl } from './constants';
import { tvMatchKey } from './keys';
import { expiresAtIso, isCacheExpired } from './settings';

export type TvEnrichDeps = {
  cache: TmdbCache;
  client: TmdbHttpClient;
  cacheTtlMs: number;
  negativeCacheTtlMs: number;
  log: (message: string) => void;
};

// A show TMDB itself says is 'Ended'/'Canceled' and not currently producing
// won't have new episode/status data to report — caching it this much
// longer than an active show is what keeps a big, mostly-finished library
// from re-checking its dead shows on the same clock as its live ones (the
// thundering-herd cause behind occasional /api/shows stalls). Still finite,
// not permanent, so a revival self-heals within this window even if nobody
// hits the manual "Refresh TMDB" escape hatch on the show detail page.
const DORMANT_CACHE_TTL_MULTIPLIER = 6;

// A season whose every known episode aired at least this long ago gets the
// same extended TTL as a dormant show's own row (see
// DORMANT_CACHE_TTL_MULTIPLIER), independent of whether the *show* itself
// is dormant — a back-catalog season of an otherwise still-airing show
// (season 1 of a show now shooting season 2) was previously stuck on the
// plain 7-day TTL forever, since isSeasonFinished below is evaluated per
// season from the episode list TMDB just returned, not from the show-level
// status/in_production flags loadSeasonEpisodes's callers may or may not
// have passed through `options.dormant`. The buffer (not "aired == today")
// gives TMDB room to fix a late title/overview edit shortly after a finale
// airs before this season is treated as settled.
const SEASON_FINISHED_BUFFER_MS = 14 * 24 * 60 * 60 * 1000;

/** True once every episode TMDB currently lists for this season has a known
 * air date and the latest one is comfortably in the past (see
 * SEASON_FINISHED_BUFFER_MS) — a currently-airing season (any episode with
 * no air date yet, or a future one) is never "finished," so it keeps
 * refreshing on the normal short TTL until it actually wraps up. */
export function isSeasonFinished(episodes: { air_date?: string }[]): boolean {
  if (episodes.length === 0) return false;
  let latestAirDate: string | undefined;
  for (const episode of episodes) {
    if (!episode.air_date) return false;
    if (!latestAirDate || episode.air_date > latestAirDate) {
      latestAirDate = episode.air_date;
    }
  }
  return Date.now() - Date.parse(latestAirDate!) > SEASON_FINISHED_BUFFER_MS;
}

/** True once TMDB itself says a show is done and not currently in
 * production — both checked together because a 'Returning Series' between
 * seasons can report in_production: false during an ordinary hiatus, so
 * status alone isn't enough to call it truly finished. Unknown/missing
 * status (undefined, or a value outside TMDB's own vocabulary) is never
 * treated as dormant — better to keep checking than to silently go stale
 * forever on a misread. */
export function isDormantShow(meta: {
  status?: string | null;
  inProduction?: boolean | null;
}): boolean {
  return (
    (meta.status === 'Ended' || meta.status === 'Canceled') &&
    meta.inProduction !== true
  );
}

function tvRowToShowMeta(row: {
  tmdbId: number | null;
  name: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  networkName: string | null;
  overview: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  numberOfSeasons: number | null;
  firstAirDate?: string | null;
  status?: string | null;
  inProduction?: boolean | null;
}): TmdbTvShowMeta {
  return {
    tmdbId: row.tmdbId ?? undefined,
    name: row.name ?? undefined,
    posterUrl: posterUrl(row.posterPath),
    backdropUrl: backdropUrl(row.backdropPath),
    network: row.networkName ?? undefined,
    overview: row.overview ?? undefined,
    voteAverage: row.voteAverage ?? undefined,
    voteCount: row.voteCount ?? undefined,
    numberOfSeasons: row.numberOfSeasons ?? undefined,
    firstAirDate: row.firstAirDate ?? undefined,
    status: row.status ?? undefined,
    inProduction: row.inProduction ?? undefined,
  };
}

function primaryNetworkName(details: {
  networks?: { name: string }[];
}): string | null {
  return details.networks?.[0]?.name?.trim() || null;
}

/** Map a cache row to show meta; returns undefined for negative (miss) rows. */
export function tvCacheRowToShowMeta(
  row: TmdbTvCacheRow,
): TmdbTvShowMeta | undefined {
  if (row.isNegative) {
    return undefined;
  }
  return tvRowToShowMeta(row);
}

async function resolveShow(
  matchKey: string,
  normalizedTitle: string,
  deps: TvEnrichDeps,
  options?: { forceRefresh?: boolean },
): Promise<TmdbTvShowMeta | undefined> {
  try {
    const cached = deps.cache.getTv(matchKey);
    if (cached && !options?.forceRefresh && !isCacheExpired(cached.expiresAt)) {
      return cached.isNegative ? undefined : tvRowToShowMeta(cached);
    }

    const search = await deps.client.searchTv(normalizedTitle);
    if (!search) {
      deps.cache.upsertTv({
        matchKey,
        tmdbId: null,
        isNegative: true,
        expiresAt: expiresAtIso(deps.negativeCacheTtlMs),
        name: null,
        overview: null,
        posterPath: null,
        backdropPath: null,
        networkName: null,
        voteAverage: null,
        voteCount: null,
        genreIdsJson: null,
        firstAirDate: null,
        numberOfSeasons: null,
        seasonsJson: null,
        status: null,
        inProduction: null,
      });
      deps.log(`tmdb tv search miss: ${matchKey}`);
      return undefined;
    }

    const details = await deps.client.getTv(search.id);
    if (!details) {
      // Same policy as movie enrichment: do not negative-cache detail fetch
      // failures (may be transient HTTP/network); only search miss is negative.
      deps.log(
        `tmdb tv details unavailable: ${matchKey} (id=${String(search.id)})`,
      );
      return undefined;
    }

    const genreIdsJson = JSON.stringify(details.genres?.map((g) => g.id) ?? []);
    const seasonsJson = details.seasons
      ? JSON.stringify(details.seasons)
      : null;
    const dormant = isDormantShow({
      status: details.status,
      inProduction: details.in_production,
    });
    if (dormant) {
      deps.log(`tmdb tv dormant, extending cache: ${matchKey}`);
    }

    deps.cache.upsertTv({
      matchKey,
      tmdbId: details.id,
      isNegative: false,
      expiresAt: expiresAtIso(
        dormant
          ? deps.cacheTtlMs * DORMANT_CACHE_TTL_MULTIPLIER
          : deps.cacheTtlMs,
      ),
      name: details.name,
      overview: details.overview ?? null,
      posterPath: details.poster_path ?? null,
      backdropPath: details.backdrop_path ?? null,
      networkName: primaryNetworkName(details),
      voteAverage: details.vote_average ?? null,
      voteCount: details.vote_count ?? null,
      genreIdsJson,
      firstAirDate: details.first_air_date ?? null,
      numberOfSeasons: details.number_of_seasons ?? null,
      seasonsJson,
      status: details.status ?? null,
      inProduction: details.in_production ?? null,
    });

    return tvRowToShowMeta({
      tmdbId: details.id,
      name: details.name,
      posterPath: details.poster_path ?? null,
      backdropPath: details.backdrop_path ?? null,
      networkName: primaryNetworkName(details),
      overview: details.overview ?? null,
      voteAverage: details.vote_average ?? null,
      voteCount: details.vote_count ?? null,
      numberOfSeasons: details.number_of_seasons ?? null,
      firstAirDate: details.first_air_date ?? null,
      status: details.status ?? null,
      inProduction: details.in_production ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log(`tmdb tv enrich failed for ${matchKey}: ${message}`);
    return undefined;
  }
}

/** Exported for the missing-episodes feature (src/shows/episode-status.ts),
 * which needs TMDB's canonical per-season episode list independent of
 * ShowBreakdown.seasons — that field is built from candidate_state history
 * (what pirate_claw has queued), not TMDB's full episode list, so it can't
 * surface episodes the daemon never saw. */
export async function loadSeasonEpisodes(
  showMatchKey: string,
  tvId: number,
  seasonNumber: number,
  deps: TvEnrichDeps,
  /** `dormant`: the parent show is TMDB-confirmed done (see isDormantShow)
   * — extends this season's TTL the same way isSeasonFinished below does,
   * for the case a finished show's final season has some episode with no
   * air_date on record (isSeasonFinished alone would never call that
   * "finished"). Most seasons don't need this passed at all: isSeasonFinished
   * already extends a completed season's TTL from its own episode list,
   * independent of whether the *show* is dormant — see its doc comment. */
  options?: { forceRefresh?: boolean; dormant?: boolean },
): Promise<
  | {
      episode_number: number;
      name?: string;
      still_path?: string | null;
      air_date?: string;
      overview?: string;
    }[]
  | undefined
> {
  try {
    const cached = deps.cache.getTvSeason(showMatchKey, seasonNumber);
    if (cached && !options?.forceRefresh && !isCacheExpired(cached.expiresAt)) {
      const parsed = JSON.parse(cached.episodesJson) as {
        episode_number: number;
        name?: string;
        still_path?: string | null;
        air_date?: string;
        overview?: string;
      }[];
      if (parsed.length === 0) {
        return undefined;
      }
      return parsed;
    }

    const detail = await deps.client.getTvSeason(tvId, seasonNumber);
    if (!detail?.episodes) {
      deps.log(
        `tmdb tv season unavailable: ${showMatchKey} s${String(seasonNumber)}`,
      );
      deps.cache.upsertTvSeason({
        showMatchKey,
        seasonNumber,
        expiresAt: expiresAtIso(deps.negativeCacheTtlMs),
        episodesJson: '[]',
      });
      return undefined;
    }

    const episodesJson = JSON.stringify(detail.episodes);
    deps.cache.upsertTvSeason({
      showMatchKey,
      seasonNumber,
      expiresAt: expiresAtIso(
        options?.dormant || isSeasonFinished(detail.episodes)
          ? deps.cacheTtlMs * DORMANT_CACHE_TTL_MULTIPLIER
          : deps.cacheTtlMs,
      ),
      episodesJson,
    });

    return detail.episodes;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log(
      `tmdb tv season load failed ${showMatchKey} s${String(seasonNumber)}: ${message}`,
    );
    return undefined;
  }
}

function episodeMetaFromTmdb(ep: {
  episode_number: number;
  name?: string;
  still_path?: string | null;
  air_date?: string;
  overview?: string;
}): TmdbTvEpisodeMeta {
  return {
    name: ep.name,
    stillUrl: stillUrl(ep.still_path),
    airDate: ep.air_date,
    overview: ep.overview,
  };
}

async function enrichSeason(
  showMatchKey: string,
  tvId: number,
  season: ShowSeason,
  deps: TvEnrichDeps,
  options?: { forceRefresh?: boolean; dormant?: boolean },
): Promise<ShowSeason> {
  const tmdbEps = await loadSeasonEpisodes(
    showMatchKey,
    tvId,
    season.season,
    deps,
    options,
  );
  if (!tmdbEps) {
    return season;
  }

  const episodes: ShowEpisode[] = season.episodes.map((local) => {
    const hit = tmdbEps.find((e) => e.episode_number === local.episode);
    if (!hit) {
      return local;
    }
    return { ...local, tmdb: episodeMetaFromTmdb(hit) };
  });

  return { season: season.season, episodes };
}

/**
 * Enrich TV show breakdowns with TMDB metadata (lazy cache + API on miss).
 */
export async function enrichShowBreakdowns(
  shows: ShowBreakdown[],
  deps: TvEnrichDeps,
): Promise<ShowBreakdown[]> {
  return Promise.all(
    shows.map(async (show) => {
      const key = tvMatchKey(show.normalizedTitle);
      const showMeta = await resolveShow(key, show.normalizedTitle, deps);

      if (!showMeta?.tmdbId) {
        return showMeta ? { ...show, tmdb: showMeta } : show;
      }

      const tvId = showMeta.tmdbId;
      const dormant = isDormantShow(showMeta);
      const seasons = await Promise.all(
        show.seasons.map((season) =>
          enrichSeason(key, tvId, season, deps, { dormant }),
        ),
      );

      return {
        ...show,
        seasons,
        tmdb: showMeta,
      };
    }),
  );
}

export async function refreshShowBreakdown(
  show: ShowBreakdown,
  deps: TvEnrichDeps,
): Promise<ShowBreakdown> {
  const key = tvMatchKey(show.normalizedTitle);
  const showMeta = await resolveShow(key, show.normalizedTitle, deps, {
    forceRefresh: true,
  });

  if (!showMeta?.tmdbId) {
    return showMeta ? { ...show, tmdb: showMeta } : show;
  }

  const dormant = isDormantShow(showMeta);
  const seasons = await Promise.all(
    show.seasons.map((season) =>
      enrichSeason(key, showMeta.tmdbId!, season, deps, {
        forceRefresh: true,
        dormant,
      }),
    ),
  );

  return {
    ...show,
    seasons,
    tmdb: showMeta,
  };
}
