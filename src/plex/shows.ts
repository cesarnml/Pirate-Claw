import type { ShowBreakdown } from '../tv-api-types';
import type { PlexHttpClient, PlexSearchResult } from './client';
import type { PlexCache } from './cache';

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
    const row = deps.cache.getTv(show.normalizedTitle);
    if (
      !row ||
      isPlexShowCacheExpired(row.cachedAt, deps.refreshIntervalMinutes)
    ) {
      return show;
    }

    return {
      ...show,
      plexStatus: row.inLibrary ? 'in_library' : 'missing',
      watchCount: row.watchCount ?? 0,
      lastWatchedAt: row.lastWatchedAt,
    };
  });
}

export async function refreshShowLibraryCache(
  shows: ShowBreakdown[],
  deps: PlexShowEnrichDeps,
): Promise<void> {
  const uniqueShows = dedupeShows(shows);

  for (const show of uniqueShows) {
    try {
      const searchResults = await deps.client.searchShows(show.normalizedTitle);
      if (searchResults === null) {
        deps.log(
          `plex show refresh skipped for ${show.normalizedTitle}: search unavailable`,
        );
        continue;
      }

      const best = selectBestShowMatch(show, searchResults);
      const cachedAt = new Date().toISOString();

      if (!best) {
        deps.cache.upsertTv({
          normalizedTitle: show.normalizedTitle,
          plexRatingKey: null,
          inLibrary: false,
          watchCount: 0,
          lastWatchedAt: null,
          cachedAt,
        });
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.log(
        `plex show refresh failed for ${show.normalizedTitle}: ${message}`,
      );
    }
  }
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

function selectBestShowMatch(
  show: ShowBreakdown,
  candidates: PlexSearchResult[],
): PlexSearchResult | undefined {
  let best: { score: number; result: PlexSearchResult } | undefined;

  for (const candidate of candidates) {
    const score = showMatchScore(show, candidate);
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
  show: ShowBreakdown,
  candidate: PlexSearchResult,
): number {
  const title = normalizeForMatch(show.normalizedTitle);
  const candidateTitle = normalizeForMatch(candidate.title ?? '');
  if (!candidateTitle) {
    return 0;
  }

  let score = diceCoefficient(title, candidateTitle);
  if (candidate.type && candidate.type !== 'show') {
    score -= 0.2;
  }

  return score;
}

function normalizeForMatch(input: string): string {
  return input
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
