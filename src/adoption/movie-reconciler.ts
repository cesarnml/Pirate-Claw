import { basename, extname } from 'node:path';
import type { ManualMovieGrabsStore } from '../manual-movie-grabs/store';
import { normalizeFeedItem } from '../normalize';
import { titlesMatch } from './title-match';
import { walkVideoFiles } from './reconciler';

export type MovieAdoptionCandidate = {
  tmdbId: number;
  title: string;
  /** ISO release date (YYYY-MM-DD) — only its year is used, for matching. */
  releaseDate: string | null;
  imdbId: string | null;
  posterUrl: string | null;
  alreadyGrabbed: boolean;
};

export type AdoptMoviesFromFilesystemDeps = {
  /** Every root directory to walk for on-disk movie files: pirate-claw's
   * own canonical `<installRoot>/media/movies` (see
   * installRootMediaMoviesDir) plus any other directory literally named
   * "movies" found under the install root (see discoverMovieDirectories) —
   * covers a torrent added by hand through Transmission's web UI landing
   * somewhere else entirely. Empty skips the filesystem sweep entirely (no
   * install root configured). */
  mediaMoviesDirs: string[];
  manualMovieGrabs: ManualMovieGrabsStore;
  log?: (message: string) => void;
};

/**
 * Adopts evidence of a movie's file sitting on disk with no
 * manual_movie_grabs/candidate_state row behind it — a torrent added by
 * hand through Transmission's web UI, landing anywhere under a
 * pirate-claw-managed directory literally named "movies", not just
 * pirate-claw's own canonical media/movies.
 *
 * Scoped to `candidates` only (no "unclaimed" UI) — mirrors the TV show
 * reconciler's own rule (see reconciler.ts's module doc): a file that
 * matches nothing currently displayed is left alone.
 *
 * Matching requires BOTH title and year to agree — unlike the TV walker,
 * movies have no season/episode to disambiguate with, and title alone is
 * exactly the kind of ambiguity that can adopt the wrong movie (two
 * different films can share a title, e.g. two different "Odyssey"s). A
 * candidate with no known release year, or a file whose year can't be
 * parsed out of its name, is skipped rather than guessed.
 *
 * Best-effort throughout: any failure here must never break the page that
 * triggered it, so every failure is logged, not thrown.
 */
export async function adoptMoviesFromFilesystem(
  candidates: MovieAdoptionCandidate[],
  deps: AdoptMoviesFromFilesystemDeps,
): Promise<Set<number>> {
  const log = deps.log ?? (() => {});
  const adopted = new Set<number>();

  const targets = candidates
    .filter((c) => !c.alreadyGrabbed && c.releaseDate)
    .map((c) => ({ ...c, year: releaseYear(c.releaseDate!) }))
    .filter((c): c is typeof c & { year: number } => c.year !== undefined);

  if (deps.mediaMoviesDirs.length === 0 || targets.length === 0) {
    return adopted;
  }

  let filePaths: string[];
  try {
    const walked = await Promise.all(
      deps.mediaMoviesDirs.map((dir) => walkVideoFiles(dir)),
    );
    filePaths = walked.flat();
  } catch (error) {
    log(`movie adoption: filesystem walk failed: ${formatError(error)}`);
    return adopted;
  }

  for (const filePath of filePaths) {
    if (adopted.size === targets.length) break; // every target already matched

    const rawTitle = basename(filePath, extname(filePath));
    const parsed = normalizeFeedItem({ mediaType: 'movie', rawTitle });
    if (parsed.year === undefined) continue;

    const match = targets.find(
      (t) =>
        !adopted.has(t.tmdbId) &&
        t.year === parsed.year &&
        titlesMatch(parsed.normalizedTitle, t.title),
    );
    if (!match) continue;

    try {
      deps.manualMovieGrabs.record({
        tmdbId: match.tmdbId,
        imdbId: match.imdbId,
        source: 'adopted-filesystem',
        rawTitle,
        transmissionTorrentHash: null,
        transmissionTorrentId: null,
        moviePosterUrl: match.posterUrl,
        movieDisplayTitle: match.title,
        movieYear: match.year,
      });
      adopted.add(match.tmdbId);
    } catch (error) {
      log(
        `movie adoption: failed to record ${filePath}: ${formatError(error)}`,
      );
    }
  }

  return adopted;
}

function releaseYear(releaseDate: string): number | undefined {
  const year = Number(releaseDate.slice(0, 4));
  return Number.isFinite(year) ? year : undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
