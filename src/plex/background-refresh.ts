import { buildMovieBreakdowns } from '../api';
import { buildShowBreakdowns } from '../api';
import { manualMovieGrabsAsBreakdowns } from '../manual-movie-grabs/store';
import type { ManualMovieGrabsStore } from '../manual-movie-grabs/store';
import type { Repository } from '../repository';
import type { TrackedShowsStore } from '../tracked-shows/store';
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
  /** Without this, a show tracked with zero candidate_state rows (e.g. added
   * after its season already aired) is invisible to this sweep forever —
   * buildShowBreakdowns only seeds tracked-but-empty stubs when given a
   * tracked-title list. See api.ts's own callers for the same wiring. */
  trackedShows?: TrackedShowsStore;
  /** Without this, a movie that only ever exists via a manual/adopted grab
   * (no candidate_state row) never gets its plexStatus checked at all —
   * ownedMovieTmdbIds's Plex override (api.ts) then has nothing to read and
   * falls back to trusting the ledger forever, exactly the bug this whole
   * mechanism exists to fix. */
  manualMovieGrabs?: ManualMovieGrabsStore;
  log: (message: string) => void;
}): Promise<void> {
  const {
    repository,
    plexMovies,
    plexShows,
    trackedShows,
    manualMovieGrabs,
    log,
  } = input;
  if (!plexMovies && !plexShows) {
    return;
  }

  const candidates = repository.listCandidateStates();
  if (plexMovies) {
    try {
      const candidateMovies = buildMovieBreakdowns(candidates);
      const manualMovies = manualMovieGrabs
        ? manualMovieGrabsAsBreakdowns(manualMovieGrabs)
        : [];
      const { skipped } = await refreshMovieLibraryCache(
        [...candidateMovies, ...manualMovies],
        plexMovies,
      );
      // Visible trail for the 2026-08-31 false-negative-on-timeout fix: a
      // skipped count that's consistently a large fraction of the batch
      // means Plex is unreachable often enough to be worth investigating on
      // its own, even though no cache row gets corrupted by it anymore.
      if (skipped > 0) {
        log(`[plex] movie refresh: ${skipped} skipped (no Plex answer)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[plex] movie refresh failed: ${message}`);
    }
  }
  if (plexShows) {
    try {
      const trackedNormalizedTitles = trackedShows
        ?.list()
        .map((show) => show.normalizedTitle);
      const shows = buildShowBreakdowns(candidates, trackedNormalizedTitles);
      const { skipped } = await refreshShowLibraryCache(shows, plexShows);
      if (skipped > 0) {
        log(`[plex] show refresh: ${skipped} skipped (no Plex answer)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[plex] show refresh failed: ${message}`);
    }
  }
  log('[plex] background refresh completed');
}
