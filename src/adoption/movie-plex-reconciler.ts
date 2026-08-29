import type { PlexHttpClient, PlexSearchResult } from '../plex/client';
import type { ManualMovieGrabsStore } from '../manual-movie-grabs/store';
import type { MovieAdoptionCandidate } from './movie-reconciler';
import { releaseYear } from './movie-reconciler';

export type AdoptMoviesFromPlexDeps = {
  plexClient: PlexHttpClient;
  manualMovieGrabs: ManualMovieGrabsStore;
  log?: (message: string) => void;
};

/**
 * Adopts a movie that's already sitting in Plex but has no
 * manual_movie_grabs/candidate_state row at all — the "predates
 * pirate-claw" case: a movie in your Plex library from before this app
 * existed, never RSS-matched, never manually grabbed, and not necessarily
 * anywhere under a pirate-claw-managed directory (so the filesystem
 * reconciler — adoptMoviesFromFilesystem — can't find it either).
 *
 * Matches by Plex's own resolved external id (its `Guid`s: tmdb:// preferred,
 * imdb:// as fallback — see PlexSearchResult's doc comment), NOT by fuzzy
 * title+year. A candidate whose matching Plex entry has neither guid is left
 * alone rather than falling back to a fuzzy match — see the movie-reconciler
 * module doc for why title-only/fuzzy matching is exactly the kind of
 * ambiguity this app has been burned by (two different movies can share a
 * title and year; Plex's own Guid is Plex's actual resolved identity for
 * that file, not a guess).
 *
 * Best-effort throughout: any failure here must never break the page that
 * triggered it, so every failure is logged, not thrown.
 */
export async function adoptMoviesFromPlex(
  candidates: MovieAdoptionCandidate[],
  deps: AdoptMoviesFromPlexDeps,
): Promise<Set<number>> {
  const log = deps.log ?? (() => {});
  const adopted = new Set<number>();

  const targets = candidates.filter((c) => !c.alreadyGrabbed);
  if (targets.length === 0) return adopted;

  let catalog: PlexSearchResult[];
  try {
    catalog = await deps.plexClient.listAllMoviesForMatching();
  } catch (error) {
    log(`plex movie adoption: catalog fetch failed: ${formatError(error)}`);
    return adopted;
  }

  const byTmdbId = new Map<number, PlexSearchResult>();
  const byImdbId = new Map<string, PlexSearchResult>();
  for (const entry of catalog) {
    if (entry.tmdbId !== undefined) byTmdbId.set(entry.tmdbId, entry);
    if (entry.imdbId) byImdbId.set(entry.imdbId, entry);
  }
  if (byTmdbId.size === 0 && byImdbId.size === 0) return adopted;

  for (const target of targets) {
    const match =
      byTmdbId.get(target.tmdbId) ??
      (target.imdbId ? byImdbId.get(target.imdbId) : undefined);
    if (!match) continue;

    try {
      deps.manualMovieGrabs.record({
        tmdbId: target.tmdbId,
        imdbId: target.imdbId,
        source: 'adopted-plex',
        rawTitle: match.title ?? target.title,
        transmissionTorrentHash: null,
        transmissionTorrentId: null,
        moviePosterUrl: target.posterUrl,
        movieDisplayTitle: target.title,
        movieYear: target.releaseDate ? releaseYear(target.releaseDate) : null,
      });
      adopted.add(target.tmdbId);
    } catch (error) {
      log(
        `plex movie adoption: failed to record tmdbId=${target.tmdbId}: ${formatError(error)}`,
      );
    }
  }

  return adopted;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
