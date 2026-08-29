import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const SHOW_DIR_NAMES = new Set(['tv', 'shows']);
const MOVIE_DIR_NAMES = new Set(['movies', 'movie']);

/** Directories never worth descending into: known non-media state
 * (`config`, `data`, `transmission`), and `incomplete` specifically because
 * an in-progress download isn't owned yet — adopting a partial file would
 * be worse than not finding it at all. */
const EXCLUDED_DIR_NAMES = new Set([
  'config',
  'data',
  'transmission',
  'incomplete',
]);

/** Bounds a pathological bind-mount (e.g. the whole NAS root mounted in by
 * mistake) from turning this into an unbounded walk — the install root's
 * own structure is only ever a few levels deep. */
const MAX_DEPTH = 8;

/**
 * Finds every directory under `installRoot` named exactly "tv" or "shows"
 * (case-insensitive), beyond pirate-claw's own canonical `media/shows`.
 *
 * Covers episode files that ended up somewhere else because of how
 * Transmission's own download-location was set at the time — e.g. a torrent
 * added by hand through Transmission's web UI landing under
 * `downloads/complete/tv` rather than `media/shows`. A matched directory is
 * a leaf: everything under it is assumed to already be organized by show,
 * so this doesn't recurse further inside one once found.
 */
export async function discoverShowDirectories(
  installRoot: string,
): Promise<string[]> {
  return discoverMediaDirectories(installRoot, SHOW_DIR_NAMES);
}

/**
 * Same idea as {@link discoverShowDirectories}, for movies: finds every
 * directory under `installRoot` named exactly "movies" or "movie"
 * (case-insensitive), beyond pirate-claw's own canonical `media/movies`.
 * Lets the movie library reconciler notice a torrent added by hand through
 * Transmission's web UI even though pirate-claw never ingested it — see
 * src/adoption/movie-reconciler.ts.
 */
export async function discoverMovieDirectories(
  installRoot: string,
): Promise<string[]> {
  return discoverMediaDirectories(installRoot, MOVIE_DIR_NAMES);
}

async function discoverMediaDirectories(
  installRoot: string,
  targetDirNames: Set<string>,
): Promise<string[]> {
  const found: string[] = [];
  await walk(installRoot, 0);
  return found;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Directory vanished mid-walk, or was never created — not fatal to
      // the rest of the discovery pass.
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lowerName = entry.name.toLowerCase();
      if (EXCLUDED_DIR_NAMES.has(lowerName)) continue;

      const fullPath = join(dir, entry.name);
      if (targetDirNames.has(lowerName)) {
        found.push(fullPath);
        continue;
      }
      await walk(fullPath, depth + 1);
    }
  }
}
