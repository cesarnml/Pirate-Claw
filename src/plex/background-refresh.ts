import { buildMovieBreakdowns } from '../api';
import { buildShowBreakdowns } from '../api';
import type { Repository } from '../repository';
import type { PlexMovieEnrichDeps } from './movies';
import { refreshMovieLibraryCache } from './movies';
import type { PlexShowEnrichDeps } from './shows';
import { refreshShowLibraryCache } from './shows';

/**
 * Warm or refresh Plex cache for tracked media without blocking RSS intake.
 */
export async function runPlexBackgroundRefresh(input: {
  repository: Repository;
  plexMovies?: PlexMovieEnrichDeps;
  plexShows?: PlexShowEnrichDeps;
  log: (message: string) => void;
}): Promise<void> {
  const { repository, plexMovies, plexShows, log } = input;
  if (!plexMovies && !plexShows) {
    return;
  }

  const candidates = repository.listCandidateStates();
  if (plexMovies) {
    try {
      const movies = buildMovieBreakdowns(candidates);
      await refreshMovieLibraryCache(movies, plexMovies);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[plex] movie refresh failed: ${message}`);
    }
  }
  if (plexShows) {
    try {
      const shows = buildShowBreakdowns(candidates);
      await refreshShowLibraryCache(shows, plexShows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[plex] show refresh failed: ${message}`);
    }
  }
  log('[plex] background refresh completed');
}
