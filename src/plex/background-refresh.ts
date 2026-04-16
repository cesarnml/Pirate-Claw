import { buildMovieBreakdowns } from '../api';
import type { Repository } from '../repository';
import type { PlexMovieEnrichDeps } from './movies';
import { refreshMovieLibraryCache } from './movies';

/**
 * Warm or refresh Plex cache for tracked media without blocking RSS intake.
 */
export async function runPlexBackgroundRefresh(input: {
  repository: Repository;
  plexMovies?: PlexMovieEnrichDeps;
  log: (message: string) => void;
}): Promise<void> {
  const { repository, plexMovies, log } = input;
  if (!plexMovies) {
    return;
  }

  const candidates = repository.listCandidateStates();
  const movies = buildMovieBreakdowns(candidates);
  await refreshMovieLibraryCache(movies, plexMovies);
  log('[plex] background refresh completed');
}
