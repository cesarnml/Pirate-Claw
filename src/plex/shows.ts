import type { ShowBreakdown } from '../tv-api-types';
import {
  type PlexHttpClient,
  type PlexSearchResult,
  dedupeSearchResults,
} from './client';
import type { PlexCache } from './cache';
// Shared shape with refreshMovieLibraryCache — see RefreshLibraryCacheResult's
// own doc comment in movies.ts for why callers need checked/skipped, not
// just void.
import type { RefreshLibraryCacheResult } from './movies';

const PLEX_SHOW_MATCH_THRESHOLD = 0.72;

export type PlexShowEnrichDeps = {
  cache: PlexCache;
  client: PlexHttpClient;
  refreshIntervalMinutes: number;
  log: (message: string) => void;
};

export function enrichShowBreakdownsFromPlexCache(
  shows: ShowBreakdown[],
  deps: Pick<PlexShowEnrichDeps, 'cache' | 'refreshIntervalMinutes'>,
): ShowBreakdown[] {
  return shows.map((show) => {
    // No TTL here, unlike the whole-show flag below — see
    // PlexCache.upsertSeasonCompletion's doc comment for why. Omitted
    // entirely (not an empty array) when nothing's been computed yet, so
    // the UI can tell "never checked" apart from "checked, and it's empty."
    const seasonCompletionRows = deps.cache.getSeasonCompletions(
      show.normalizedTitle,
    );
    const withSeasonCompletions =
      seasonCompletionRows.length > 0
        ? {
            ...show,
            seasonCompletions: seasonCompletionRows.map((r) => ({
              season: r.season,
              airedCount: r.airedCount,
              ownedCount: r.ownedCount,
              cachedAt: r.cachedAt,
            })),
          }
        : show;

    const row = deps.cache.getTv(withSeasonCompletions.normalizedTitle);
    if (!row) {
      return withSeasonCompletions;
    }

    // plexCheckedAt is surfaced even when the row is stale (below) — the
    // whole point is telling "never checked" apart from "checked a while
    // ago, due for another look," which the UI can't do from plexStatus
    // alone once it's reset to 'unknown'.
    if (isPlexShowCacheExpired(row.cachedAt, deps.refreshIntervalMinutes)) {
      return { ...withSeasonCompletions, plexCheckedAt: row.cachedAt };
    }

    return {
      ...withSeasonCompletions,
      plexStatus: row.inLibrary ? 'in_library' : 'missing',
      watchCount: row.watchCount ?? 0,
      lastWatchedAt: row.lastWatchedAt,
      plexCheckedAt: row.cachedAt,
    };
  });
}

/** Single-show equivalent of refreshShowLibraryCache, for an operator-
 * triggered "Refresh Plex" action (mirrors refreshShowBreakdown in
 * tmdb/tv-enrichment.ts) — refreshes the cache for just this show, live,
 * then returns the show re-enriched from that fresh cache row. */
export async function refreshPlexShowBreakdown(
  show: ShowBreakdown,
  deps: PlexShowEnrichDeps,
): Promise<ShowBreakdown> {
  await refreshShowLibraryCache([show], deps);
  return enrichShowBreakdownsFromPlexCache([show], deps)[0]!;
}

export async function refreshShowLibraryCache(
  shows: ShowBreakdown[],
  deps: PlexShowEnrichDeps,
): Promise<RefreshLibraryCacheResult> {
  const uniqueShows = dedupeShows(shows);
  let tvCatalog: PlexSearchResult[] = [];
  // See refreshMovieLibraryCache's identical flag for the full rationale —
  // an empty tvCatalog from a failed fetch must never be mistaken for a
  // real, complete "not in the library" answer.
  let catalogAvailable = true;
  try {
    tvCatalog = await deps.client.listAllTvShowsForMatching();
  } catch (error) {
    catalogAvailable = false;
    const message = error instanceof Error ? error.message : String(error);
    deps.log(`plex TV library catalog failed: ${message}`);
  }

  let checked = 0;
  let skipped = 0;

  for (const show of uniqueShows) {
    try {
      const searchResults = await deps.client.searchShows(show.normalizedTitle);
      if (searchResults === null) {
        deps.log(
          `plex show refresh: search unavailable for ${show.normalizedTitle}; matching against library catalog only`,
        );
      }

      const merged = dedupeSearchResults([
        ...(searchResults ?? []),
        ...tvCatalog,
      ]);

      const best = selectBestShowMatch(show.normalizedTitle, merged);
      const cachedAt = new Date().toISOString();

      if (!best) {
        // No match — but only a real "not in Plex" answer when the
        // whole-library catalog fetch actually succeeded. See
        // refreshMovieLibraryCache's identical guard for the full
        // rationale: a per-title search alone is documented as an
        // unreliable fallback that can itself omit real hits, so it's
        // never sufficient on its own to justify a negative conclusion —
        // only the full catalog is. A Plex timeout on the catalog fetch
        // must never overwrite a previously confirmed in_library row
        // (2026-08-31 incident).
        if (!catalogAvailable) {
          deps.log(
            `plex show refresh: no full-catalog answer from Plex for ${show.normalizedTitle} — leaving cached status as-is`,
          );
          skipped += 1;
          continue;
        }
        deps.cache.upsertTv({
          normalizedTitle: show.normalizedTitle,
          plexRatingKey: null,
          inLibrary: false,
          watchCount: 0,
          lastWatchedAt: null,
          cachedAt,
        });
        checked += 1;
        continue;
      }

      deps.cache.upsertTv({
        normalizedTitle: show.normalizedTitle,
        plexRatingKey: best.ratingKey ?? null,
        inLibrary: true,
        watchCount: best.viewCount ?? 0,
        lastWatchedAt:
          best.lastViewedAt != null
            ? new Date(best.lastViewedAt * 1000).toISOString()
            : null,
        cachedAt,
      });
      checked += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.log(
        `plex show refresh failed for ${show.normalizedTitle}: ${message}`,
      );
    }
  }

  return { checked, skipped };
}

export function isPlexShowCacheExpired(
  cachedAt: string,
  refreshIntervalMinutes: number,
): boolean {
  const parsed = Date.parse(cachedAt);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return parsed + refreshIntervalMinutes * 2 * 60_000 <= Date.now();
}

function dedupeShows(shows: ShowBreakdown[]): ShowBreakdown[] {
  const seen = new Set<string>();
  const unique: ShowBreakdown[] = [];

  for (const show of shows) {
    const key = show.normalizedTitle.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(show);
  }

  return unique;
}

/** Exported for src/shows/episode-status.ts, which needs this same matching
 * heuristic for its own live (uncached) show lookup — keeping one matching
 * algorithm rather than a second, possibly-inconsistent one. */
export function selectBestShowMatch(
  normalizedTitle: string,
  candidates: PlexSearchResult[],
): PlexSearchResult | undefined {
  let best: { score: number; result: PlexSearchResult } | undefined;

  for (const candidate of candidates) {
    const score = showMatchScore(normalizedTitle, candidate);
    if (score < PLEX_SHOW_MATCH_THRESHOLD) {
      continue;
    }
    if (!best || score > best.score) {
      best = { score, result: candidate };
    }
  }

  return best?.result;
}

function showMatchScore(
  normalizedTitle: string,
  candidate: PlexSearchResult,
): number {
  const title = normalizeForMatch(normalizedTitle);
  const candidateTitle = normalizeForMatch(candidate.title ?? '');
  if (!candidateTitle) {
    return 0;
  }

  let score = Math.max(
    title === candidateTitle
      ? 1
      : Math.max(
          tokenCoverScore(title, candidateTitle),
          title.length >= 2 && candidateTitle.length >= 2
            ? diceCoefficient(title, candidateTitle)
            : 0,
        ),
  );

  if (candidate.type && candidate.type !== 'show') {
    score -= 0.2;
  }

  return score;
}

/** When every significant word in `needle` appears in `haystack`, boost above fuzzy-only failures. */
function tokenCoverScore(needle: string, haystack: string): number {
  const words = needle.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) {
    return 0;
  }
  const padded = ` ${haystack} `;
  const covered = words.filter((w) => padded.includes(` ${w} `)).length;
  if (covered !== words.length) {
    return 0;
  }
  return 0.94;
}

function normalizeForMatch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const leftPairs = pairCounts(left);
  const rightPairs = pairCounts(right);
  let overlap = 0;

  for (const [pair, leftCount] of leftPairs) {
    const rightCount = rightPairs.get(pair) ?? 0;
    overlap += Math.min(leftCount, rightCount);
  }

  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

function pairCounts(input: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < input.length - 1; index += 1) {
    const pair = input.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}
