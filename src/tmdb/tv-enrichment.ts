import type {
  ShowBreakdown,
  ShowEpisode,
  ShowSeason,
  TmdbTvEpisodeMeta,
  TmdbTvShowMeta,
} from '../tv-api-types';
import type { TmdbHttpClient } from './client';
import type { TmdbCache } from './cache';
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

function tvRowToShowMeta(row: {
  tmdbId: number | null;
  name: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  numberOfSeasons: number | null;
}): TmdbTvShowMeta {
  return {
    tmdbId: row.tmdbId ?? undefined,
    name: row.name ?? undefined,
    posterUrl: posterUrl(row.posterPath),
    backdropUrl: backdropUrl(row.backdropPath),
    overview: row.overview ?? undefined,
    voteAverage: row.voteAverage ?? undefined,
    voteCount: row.voteCount ?? undefined,
    numberOfSeasons: row.numberOfSeasons ?? undefined,
  };
}

async function resolveShow(
  matchKey: string,
  normalizedTitle: string,
  deps: TvEnrichDeps,
): Promise<TmdbTvShowMeta | undefined> {
  try {
    const cached = deps.cache.getTv(matchKey);
    if (cached && !isCacheExpired(cached.expiresAt)) {
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
        voteAverage: null,
        voteCount: null,
        genreIdsJson: null,
        firstAirDate: null,
        numberOfSeasons: null,
        seasonsJson: null,
      });
      deps.log(`tmdb tv search miss: ${matchKey}`);
      return undefined;
    }

    const details = await deps.client.getTv(search.id);
    if (!details) {
      deps.log(
        `tmdb tv details unavailable: ${matchKey} (id=${String(search.id)})`,
      );
      return undefined;
    }

    const genreIdsJson = JSON.stringify(details.genres?.map((g) => g.id) ?? []);
    const seasonsJson = details.seasons
      ? JSON.stringify(details.seasons)
      : null;

    deps.cache.upsertTv({
      matchKey,
      tmdbId: details.id,
      isNegative: false,
      expiresAt: expiresAtIso(deps.cacheTtlMs),
      name: details.name,
      overview: details.overview ?? null,
      posterPath: details.poster_path ?? null,
      backdropPath: details.backdrop_path ?? null,
      voteAverage: details.vote_average ?? null,
      voteCount: details.vote_count ?? null,
      genreIdsJson,
      firstAirDate: details.first_air_date ?? null,
      numberOfSeasons: details.number_of_seasons ?? null,
      seasonsJson,
    });

    return tvRowToShowMeta({
      tmdbId: details.id,
      name: details.name,
      posterPath: details.poster_path ?? null,
      backdropPath: details.backdrop_path ?? null,
      overview: details.overview ?? null,
      voteAverage: details.vote_average ?? null,
      voteCount: details.vote_count ?? null,
      numberOfSeasons: details.number_of_seasons ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log(`tmdb tv enrich failed for ${matchKey}: ${message}`);
    return undefined;
  }
}

async function loadSeasonEpisodes(
  showMatchKey: string,
  tvId: number,
  seasonNumber: number,
  deps: TvEnrichDeps,
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
    if (cached && !isCacheExpired(cached.expiresAt)) {
      const parsed = JSON.parse(cached.episodesJson) as {
        episode_number: number;
        name?: string;
        still_path?: string | null;
        air_date?: string;
        overview?: string;
      }[];
      return parsed;
    }

    const detail = await deps.client.getTvSeason(tvId, seasonNumber);
    if (!detail?.episodes) {
      deps.log(
        `tmdb tv season unavailable: ${showMatchKey} s${String(seasonNumber)}`,
      );
      return undefined;
    }

    const episodesJson = JSON.stringify(detail.episodes);
    deps.cache.upsertTvSeason({
      showMatchKey,
      seasonNumber,
      expiresAt: expiresAtIso(deps.cacheTtlMs),
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
): Promise<ShowSeason> {
  const tmdbEps = await loadSeasonEpisodes(
    showMatchKey,
    tvId,
    season.season,
    deps,
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
  const out: ShowBreakdown[] = [];

  for (const show of shows) {
    const key = tvMatchKey(show.normalizedTitle);
    const showMeta = await resolveShow(key, show.normalizedTitle, deps);

    if (!showMeta?.tmdbId) {
      out.push(showMeta ? { ...show, tmdb: showMeta } : show);
      continue;
    }

    const tvId = showMeta.tmdbId;
    const seasons: ShowSeason[] = [];
    for (const season of show.seasons) {
      seasons.push(await enrichSeason(key, tvId, season, deps));
    }

    out.push({
      normalizedTitle: show.normalizedTitle,
      seasons,
      tmdb: showMeta,
    });
  }

  return out;
}
