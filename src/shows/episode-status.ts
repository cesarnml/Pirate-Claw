import type { PlexHttpClient } from '../plex/client';
import type { PlexCache } from '../plex/cache';
import { selectBestShowMatch } from '../plex/shows';
import { loadSeasonEpisodes, type TvEnrichDeps } from '../tmdb/tv-enrichment';
import { tvMatchKey } from '../tmdb/keys';
import type { ManualGrabsStore } from '../manual-grabs/store';
import type { ShowBreakdown } from '../tv-api-types';
import type { TransmissionConfig } from '../config';
import { fetchTorrentStats, type TorrentStatSnapshot } from '../transmission';

export type EpisodePlexStatus = 'in_library' | 'missing' | 'unknown';

export type EpisodeManualGrabInfo = {
  queuedAt: string;
  source: string;
  rawTitle: string;
  transmissionTorrentHash: string | null;
  /** True when this grab's torrent looks stuck and probably won't ever
   * complete — see isStalledSnapshot for the exact definition. Always false
   * when transmission config isn't available to this build, or when the
   * live lookup itself failed (fails open: never claim "stalled" on a
   * signal we couldn't actually confirm). Powers the inline remove button
   * on the missing-episodes panel — see grill-me: torrent queue/grab UX
   * fixes, 2026-09-01. */
  stalled: boolean;
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
  /** How many of this season's episodes have aired as of today, per TMDB's
   * air dates — exposed so callers (e.g. api.ts's persistSeasonCompletions)
   * reuse this instead of re-deriving the same date comparison themselves. */
  airedEpisodeCount: number;
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
  /** Optional: without it, every manualGrab reads stalled:false rather than
   * failing the whole panel — the missing-episodes panel worked fine before
   * stalled-detection existed, and a Transmission-lookup failure shouldn't
   * take the rest of the page down with it. */
  transmissionConfig?: TransmissionConfig;
};

/** A torrent counts as stalled when it's sat in Transmission's downloading
 * state for more than a day (still resolving pieces, no matter the current
 * instantaneous rate — see grill-me Q: "skip the download rate
 * requirement", 2026-09-01), or when Transmission itself is reporting an
 * error (e.g. no peers found) regardless of age. Deliberately NOT
 * 'queued' (Transmission's own queue-cap hold — not this torrent's fault)
 * or 'stopped'/'seeding'/'completed' (paused or already done isn't
 * "stalled"). */
const STALL_AGE_MS = 24 * 60 * 60 * 1000;

function isStalledSnapshot(torrent: TorrentStatSnapshot | undefined): boolean {
  if (!torrent) return false;
  if (torrent.errorString) return true;
  if (torrent.status !== 'downloading') return false;
  if (!torrent.addedDate) return false;
  return Date.now() - Date.parse(torrent.addedDate) > STALL_AGE_MS;
}

/**
 * Assembles the season/episode grid for the missing-episodes feature: TMDB's
 * canonical per-season episode list (independent of local queue history) +
 * Plex's live per-episode presence + any manual-grab records for this show.
 * Returns null when the show has no TMDB match yet (nothing to build from).
 *
 * `options.season`, when given, restricts the *entire* walk (TMDB per-season
 * fetch AND the Plex per-season episode fetch) to just that one season —
 * this is the difference between an O(seasons) live walk and an O(1) one. A
 * show with 30+ seasons (the "Simpsons case") would otherwise re-fetch every
 * season's Plex + TMDB data on every single page view. Season buttons for
 * *other* seasons are rendered by the caller from the already-cached
 * plex_tv_season_completion rows (see ShowBreakdown.seasonCompletions), not
 * from this function's output — so omitting them here costs nothing in the
 * UI. Omitting `options.season` entirely still walks every season (used by
 * the explicit "Refresh Plex" action, which is deliberately a full refresh).
 */
export async function buildShowEpisodeStatus(
  show: ShowBreakdown,
  deps: EpisodeStatusDeps,
  options?: { season?: number },
): Promise<ShowEpisodeStatus | null> {
  const tmdbId = show.tmdb?.tmdbId;
  const numberOfSeasons = show.tmdb?.numberOfSeasons;
  if (!tmdbId || !numberOfSeasons) {
    return null;
  }

  const matchKey = tvMatchKey(show.normalizedTitle);
  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const targetSeason = options?.season;
  const plexPresence = await loadPlexPresence(show, deps.plex, targetSeason);
  const manualGrabsByKey = groupManualGrabsByEpisode(
    deps.manualGrabs.listForShow(show.normalizedTitle),
  );
  await annotateStalledGrabs(manualGrabsByKey, deps.transmissionConfig);

  // Each season's TMDB lookup is independent (own cache row, own possible
  // HTTP call) — run them concurrently rather than one at a time, the same
  // way enrichShowBreakdowns already does for its own per-show TMDB calls.
  const seasonNumbers =
    targetSeason !== undefined
      ? [targetSeason]
      : Array.from({ length: numberOfSeasons }, (_, i) => i + 1);
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
        airedEpisodeCount,
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
  targetSeason?: number,
): Promise<PlexPresence> {
  const empty: PlexPresence = { reachable: false, seasons: new Map() };
  if (!plex) {
    return empty;
  }

  const ratingKey = await resolveLiveOrCachedRatingKey(show, plex);
  if (ratingKey === undefined) {
    // Neither a live search nor the cache could confirm anything right now.
    return empty;
  }
  if (ratingKey === null) {
    // Confidently not in Plex — confident "missing" territory, not
    // "unknown". reachable:true with an empty seasons map means every
    // episode resolves to 'missing' below.
    return { reachable: true, seasons: new Map() };
  }

  const allPlexSeasons = await plex.client.getShowSeasons(ratingKey);
  if (allPlexSeasons === null) {
    // Have a ratingKey, but the live walk failed just now — transient,
    // not "this show isn't in Plex".
    return empty;
  }
  // getShowSeasons is one cheap PMS call returning every season's metadata
  // (no per-episode walk yet) — filtering here only skips the *heavier*
  // per-season getSeasonEpisodes call below, one per season, for whichever
  // seasons the caller didn't ask for.
  const plexSeasons =
    targetSeason === undefined
      ? allPlexSeasons
      : allPlexSeasons.filter((s) => s.seasonNumber === targetSeason);

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

/**
 * Resolves this show's Plex ratingKey live first, falling back to the
 * periodically-refreshed plex_tv_cache only when live search can't confirm
 * anything. A page view here is occasional and manual — same reasoning that
 * already justifies the uncached per-episode walk above — so there's no
 * reason to let a stale background-sweep snapshot be the *only* source for
 * "is this show even in Plex," which was letting a show sit unconfirmed (or
 * wrongly missing) between sweep runs even though a live check would have
 * answered it immediately.
 *
 * A live search miss does NOT by itself mean "confidently not in library" —
 * falls through to cache regardless, since /library/search is documented
 * elsewhere in this codebase (refreshShowLibraryCache) to sometimes omit or
 * reshape hits. Only a *cached* "not in library" is trusted as confident.
 *
 * Returns a ratingKey when found (live or cached); null when confidently not
 * in the library; undefined when nothing could confirm either way.
 */
async function resolveLiveOrCachedRatingKey(
  show: ShowBreakdown,
  plex: NonNullable<EpisodeStatusDeps['plex']>,
): Promise<string | null | undefined> {
  const liveResults = await plex.client.searchShows(show.normalizedTitle);
  if (liveResults !== null) {
    const match = selectBestShowMatch(show.normalizedTitle, liveResults);
    if (match?.ratingKey) {
      return match.ratingKey;
    }
  }

  const cacheRow = plex.cache.getTv(show.normalizedTitle);
  if (!cacheRow) {
    return undefined;
  }
  if (!cacheRow.inLibrary || !cacheRow.plexRatingKey) {
    return null;
  }
  return cacheRow.plexRatingKey;
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

/**
 * One batched Transmission torrent-get for every still-active grab's hash
 * on this page, mutating each entry's `stalled` in place. Batched rather
 * than one lookup per episode — a season with several manual grabs must
 * cost one RPC round trip, not N (see grill-me Q1, 2026-09-01: live lookup
 * at render time was chosen over a background poller specifically on the
 * condition it stays batched). Best-effort: any failure (no config, RPC
 * error) just leaves every `stalled` at its already-set false, same as
 * every other best-effort Transmission read in this codebase — a page
 * render must never hard-fail because Transmission is briefly unreachable.
 */
async function annotateStalledGrabs(
  manualGrabsByKey: Map<string, EpisodeManualGrabInfo>,
  transmissionConfig: TransmissionConfig | undefined,
): Promise<void> {
  if (!transmissionConfig) return;

  const hashes = Array.from(
    new Set(
      Array.from(manualGrabsByKey.values())
        .map((grab) => grab.transmissionTorrentHash)
        .filter((hash): hash is string => hash !== null),
    ),
  );
  if (hashes.length === 0) return;

  const result = await fetchTorrentStats(transmissionConfig, hashes);
  if (!result.ok) return;

  const byHash = new Map(result.torrents.map((t) => [t.hash, t]));
  for (const grab of manualGrabsByKey.values()) {
    if (!grab.transmissionTorrentHash) continue;
    grab.stalled = isStalledSnapshot(byHash.get(grab.transmissionTorrentHash));
  }
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
    // A grab already marked removed/deleted (via Torrent Manager, or this
    // feature's own stalled-torrent remove button) must not keep showing
    // "Queued via X" forever — treat it exactly as if this episode had no
    // manual grab at all, so plexStatus alone (which will read 'missing'
    // here, since Plex never got the file) drives the badge instead. This
    // was the actual bug behind grill-me's "queued torrent made clear to
    // the user" ask: the badge used to be pure DB-row-existence, blind to
    // disposition.
    if (row.disposition !== null) {
      continue;
    }
    const key = episodeKey(row.season, row.episode);
    if (!map.has(key)) {
      map.set(key, {
        queuedAt: row.queuedAt,
        source: row.source,
        rawTitle: row.rawTitle,
        transmissionTorrentHash: row.transmissionTorrentHash,
        stalled: false,
      });
    }
  }
  return map;
}
