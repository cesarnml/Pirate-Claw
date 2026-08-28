import type { PlexHttpClient } from '../plex/client';
import type { PlexCache } from '../plex/cache';
import { loadSeasonEpisodes, type TvEnrichDeps } from '../tmdb/tv-enrichment';
import { tvMatchKey } from '../tmdb/keys';
import type { ManualGrabsStore } from '../manual-grabs/store';
import type { ShowBreakdown } from '../tv-api-types';

export type EpisodePlexStatus = 'in_library' | 'missing' | 'unknown';

export type EpisodeManualGrabInfo = {
  queuedAt: string;
  source: string;
  rawTitle: string;
};

export type EpisodeWithStatus = {
  episode: number;
  name?: string;
  overview?: string;
  airDate?: string;
  plexStatus: EpisodePlexStatus;
  manualGrab: EpisodeManualGrabInfo | null;
};

export type SeasonWithStatus = {
  season: number;
  episodes: EpisodeWithStatus[];
  /** True when Plex's own episode count for this season differs from
   * TMDB's — a season-level numbering/detection quirk worth flagging rather
   * than trusting the per-episode grid blindly. Undefined when Plex data for
   * this season isn't available (can't compare). */
  episodeCountMismatch: boolean | undefined;
};

export type ShowEpisodeStatus = {
  /** False when Plex data could not be confirmed at all for this show right
   * now (unconfigured, never scanned, or a live request just failed) — every
   * episode then reads 'unknown', not 'missing', to avoid steering a manual
   * grab for something already owned. */
  plexReachable: boolean;
  seasons: SeasonWithStatus[];
};

export type EpisodeStatusDeps = {
  tmdb: TvEnrichDeps;
  plex?: {
    client: PlexHttpClient;
    cache: PlexCache;
  };
  manualGrabs: ManualGrabsStore;
};

/**
 * Assembles the season/episode grid for the missing-episodes feature: TMDB's
 * canonical per-season episode list (independent of local queue history) +
 * Plex's live per-episode presence + any manual-grab records for this show.
 * Returns null when the show has no TMDB match yet (nothing to build from).
 */
export async function buildShowEpisodeStatus(
  show: ShowBreakdown,
  deps: EpisodeStatusDeps,
): Promise<ShowEpisodeStatus | null> {
  const tmdbId = show.tmdb?.tmdbId;
  const numberOfSeasons = show.tmdb?.numberOfSeasons;
  if (!tmdbId || !numberOfSeasons) {
    return null;
  }

  const matchKey = tvMatchKey(show.normalizedTitle);
  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const plexPresence = await loadPlexPresence(show, deps.plex);
  const manualGrabsByKey = groupManualGrabsByEpisode(
    deps.manualGrabs.listForShow(show.normalizedTitle),
  );

  // Each season's TMDB lookup is independent (own cache row, own possible
  // HTTP call) — run them concurrently rather than one at a time, the same
  // way enrichShowBreakdowns already does for its own per-show TMDB calls.
  const seasonNumbers = Array.from(
    { length: numberOfSeasons },
    (_, i) => i + 1,
  );
  const seasonResults = await Promise.all(
    seasonNumbers.map(async (seasonNumber) => {
      const tmdbEpisodes = await loadSeasonEpisodes(
        matchKey,
        tmdbId,
        seasonNumber,
        deps.tmdb,
      );
      if (!tmdbEpisodes) {
        return null;
      }

      const plexSeason = plexPresence.seasons.get(seasonNumber);
      const episodes: EpisodeWithStatus[] = tmdbEpisodes
        .slice()
        .sort((a, b) => a.episode_number - b.episode_number)
        .map((ep) => {
          const grab = manualGrabsByKey.get(
            episodeKey(seasonNumber, ep.episode_number),
          );
          return {
            episode: ep.episode_number,
            name: ep.name,
            overview: ep.overview,
            airDate: ep.air_date,
            plexStatus: resolveEpisodeStatus(
              plexPresence.reachable,
              plexSeason,
              ep.episode_number,
            ),
            manualGrab: grab ?? null,
          };
        });

      // TMDB's season episode list includes unaired future episodes (a
      // "Returning Series" season lists all planned episodes up front,
      // most with a future air_date) — Plex's leafCount can only ever
      // count episodes that actually exist as files, so comparing it
      // against the *full* TMDB count would flag a mismatch for every
      // currently-airing show, every time. Compare against aired-so-far
      // count instead. Confirmed live against a real currently-airing
      // show (Stuart Fails to Save the Universe): season 1 lists 10
      // TMDB episodes, 4 of them not yet aired.
      const airedEpisodeCount = episodes.filter(
        (ep) => ep.airDate !== undefined && ep.airDate <= todayIsoDate,
      ).length;
      const season: SeasonWithStatus = {
        season: seasonNumber,
        episodes,
        episodeCountMismatch:
          plexSeason === undefined
            ? undefined
            : plexSeason.episodeCount !== airedEpisodeCount,
      };
      return season;
    }),
  );

  const seasons = seasonResults.filter(
    (s): s is SeasonWithStatus => s !== null,
  );
  return { plexReachable: plexPresence.reachable, seasons };
}

type PlexSeasonPresence = {
  episodeCount: number | undefined;
  /** undefined = this season's own episode walk failed; every episode in it
   * reads 'unknown' even though the show overall is reachable. */
  episodeNumbers: Set<number> | undefined;
};

type PlexPresence = {
  reachable: boolean;
  seasons: Map<number, PlexSeasonPresence>;
};

async function loadPlexPresence(
  show: ShowBreakdown,
  plex: EpisodeStatusDeps['plex'],
): Promise<PlexPresence> {
  const empty: PlexPresence = { reachable: false, seasons: new Map() };
  if (!plex) {
    return empty;
  }

  const cacheRow = plex.cache.getTv(show.normalizedTitle);
  if (!cacheRow) {
    // Never scanned by the background Plex sweep yet — can't confirm.
    return empty;
  }
  if (!cacheRow.inLibrary || !cacheRow.plexRatingKey) {
    // Plex WAS searched and this show genuinely isn't there — confident
    // "missing" territory, not "unknown". reachable:true with an empty
    // seasons map means every episode resolves to 'missing' below.
    return { reachable: true, seasons: new Map() };
  }

  const plexSeasons = await plex.client.getShowSeasons(cacheRow.plexRatingKey);
  if (plexSeasons === null) {
    // Have a ratingKey, but the live walk failed just now — transient,
    // not "this show isn't in Plex".
    return empty;
  }

  // Same reasoning as the TMDB season loop above — one PMS round trip per
  // season, independent of the others, so run them concurrently.
  const entries = await Promise.all(
    plexSeasons.map(async (season) => {
      const episodes = await plex.client.getSeasonEpisodes(season.ratingKey);
      const presence: PlexSeasonPresence = {
        episodeCount: season.episodeCount,
        episodeNumbers:
          episodes === null
            ? undefined
            : new Set(episodes.map((e) => e.episodeNumber)),
      };
      return [season.seasonNumber, presence] as const;
    }),
  );
  return { reachable: true, seasons: new Map(entries) };
}

function resolveEpisodeStatus(
  showReachable: boolean,
  season: PlexSeasonPresence | undefined,
  episodeNumber: number,
): EpisodePlexStatus {
  if (!showReachable) {
    return 'unknown';
  }
  if (season === undefined) {
    // Show is confidently not in Plex at all (empty seasons map case), or
    // TMDB has a season Plex has no season entry for at all — either way,
    // confident "missing".
    return 'missing';
  }
  if (season.episodeNumbers === undefined) {
    // This one season's episode walk failed — unknown, not missing.
    return 'unknown';
  }
  return season.episodeNumbers.has(episodeNumber) ? 'in_library' : 'missing';
}

function episodeKey(season: number, episode: number): string {
  return `${season}:${episode}`;
}

function groupManualGrabsByEpisode(
  rows: ReturnType<ManualGrabsStore['listForShow']>,
): Map<string, EpisodeManualGrabInfo> {
  const map = new Map<string, EpisodeManualGrabInfo>();
  // rows is already most-recent-first; keep only the first (latest) per
  // episode.
  for (const row of rows) {
    const key = episodeKey(row.season, row.episode);
    if (!map.has(key)) {
      map.set(key, {
        queuedAt: row.queuedAt,
        source: row.source,
        rawTitle: row.rawTitle,
      });
    }
  }
  return map;
}
