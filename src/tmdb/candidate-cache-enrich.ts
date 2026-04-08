import type { CandidateStateRecord } from '../repository';
import type { TmdbCache } from './cache';
import { movieMatchKey, tvMatchKey } from './keys';
import { movieCacheRowToPublic } from './movie-enrichment';
import { isCacheExpired } from './settings';
import { tvCacheRowToShowMeta } from './tv-enrichment';

/**
 * Attach TMDB poster/rating/etc. from existing SQLite cache rows only (no TMDB HTTP).
 * Matches keys used by movie and TV lazy enrichment.
 */
export function enrichCandidatesFromCache(
  candidates: CandidateStateRecord[],
  cache: TmdbCache,
  onError?: (error: unknown, candidate: CandidateStateRecord) => void,
): CandidateStateRecord[] {
  return candidates.map((c) => {
    try {
      if (c.mediaType === 'movie') {
        const key = movieMatchKey(c.normalizedTitle, c.year);
        const row = cache.getMovie(key);
        if (row && !isCacheExpired(row.expiresAt)) {
          const tmdb = movieCacheRowToPublic(row);
          if (tmdb) {
            return { ...c, tmdb };
          }
        }
      } else {
        const key = tvMatchKey(c.normalizedTitle);
        const row = cache.getTv(key);
        if (row && !isCacheExpired(row.expiresAt)) {
          const tmdb = tvCacheRowToShowMeta(row);
          if (tmdb) {
            return { ...c, tmdb };
          }
        }
      }
    } catch (error) {
      onError?.(error, c);
    }
    return c;
  });
}
