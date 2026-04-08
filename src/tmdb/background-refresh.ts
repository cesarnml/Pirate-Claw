import { buildMovieBreakdowns, buildShowBreakdowns } from '../api';
import type { Repository } from '../repository';
import type { MovieEnrichDeps } from './movie-enrichment';
import { enrichMovieBreakdowns } from './movie-enrichment';
import type { TvEnrichDeps } from './tv-enrichment';
import { enrichShowBreakdowns } from './tv-enrichment';

/**
 * Warm or refresh TMDB cache for current candidates using the same lazy enrichment
 * as API reads (respects TTL / negative-cache rules). Does not block RSS intake.
 */
export async function runTmdbBackgroundRefresh(input: {
  repository: Repository;
  tmdbMovies?: MovieEnrichDeps;
  tmdbShows?: TvEnrichDeps;
  log: (message: string) => void;
}): Promise<void> {
  const { repository, tmdbMovies, tmdbShows, log } = input;
  if (!tmdbMovies && !tmdbShows) {
    return;
  }

  const candidates = repository.listCandidateStates();

  if (tmdbMovies) {
    const movies = buildMovieBreakdowns(candidates);
    await enrichMovieBreakdowns(movies, tmdbMovies);
  }

  if (tmdbShows) {
    const shows = buildShowBreakdowns(candidates);
    await enrichShowBreakdowns(shows, tmdbShows);
  }

  log('[tmdb] background refresh completed');
}
