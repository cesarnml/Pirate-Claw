import { readdir } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import type { TransmissionConfig } from '../config';
import { fetchAllTorrentsForAdoption } from '../transmission';
import type { ManualGrabsStore } from '../manual-grabs/store';
import type { TrackedShowRecord } from '../tracked-shows/store';
import { normalizeFeedItem } from '../normalize';
import { titlesMatch } from './title-match';

const VIDEO_EXTENSIONS = new Set([
  '.mkv',
  '.mp4',
  '.avi',
  '.m4v',
  '.ts',
  '.wmv',
  '.mov',
]);

export type ReconcileShowLibraryDeps = {
  transmission: TransmissionConfig;
  manualGrabs: ManualGrabsStore;
  /** Root directory to walk for on-disk episode files, e.g.
   * `<installRoot>/media/shows` (see installRootMediaShowsDir). Undefined
   * skips the filesystem sweep entirely (no install root configured). */
  mediaShowsDir: string | undefined;
  log?: (message: string) => void;
};

export type ReconcileShowLibraryResult = {
  adoptedFromTransmission: number;
  adoptedFromFilesystem: number;
};

/**
 * Adopts evidence of a tracked show's episodes that pirate-claw's own
 * pipeline never recorded: a torrent added by hand through Transmission's
 * web UI, or a file sitting on disk with no torrent behind it at all. Both
 * only ever apply to a show already in the tracked-show ledger — an
 * unrecognized torrent/file that matches nothing tracked is left alone
 * entirely (no "unclaimed" UI; see grill-me).
 *
 * Best-effort throughout: any failure here must never break the page that
 * triggered it (see the episodes route in api.ts), so every external call is
 * individually guarded and failures are logged, not thrown.
 */
export async function reconcileShowLibrary(
  show: TrackedShowRecord,
  deps: ReconcileShowLibraryDeps,
): Promise<ReconcileShowLibraryResult> {
  const log = deps.log ?? (() => {});
  // Sequential, not Promise.all: adoptFromFilesystem dedupes against
  // manual_grabs by reading it once up front (no hash to key off of), so
  // running it concurrently with adoptFromTransmission could read that
  // snapshot before a torrent for the same episode finishes recording —
  // adopting the same episode twice under two different sources. Running
  // Transmission's (usually slower, network) sweep first means the
  // filesystem sweep always sees its results already committed.
  const adoptedFromTransmission = await adoptFromTransmission(show, deps, log);
  const adoptedFromFilesystem = await adoptFromFilesystem(show, deps, log);
  return { adoptedFromTransmission, adoptedFromFilesystem };
}

async function adoptFromTransmission(
  show: TrackedShowRecord,
  deps: ReconcileShowLibraryDeps,
  log: (message: string) => void,
): Promise<number> {
  let result;
  try {
    result = await fetchAllTorrentsForAdoption(deps.transmission);
  } catch (error) {
    log(
      `adoption: transmission list failed for ${show.normalizedTitle}: ${formatError(error)}`,
    );
    return 0;
  }
  if (!result.ok) {
    log(
      `adoption: transmission list failed for ${show.normalizedTitle}: ${result.message}`,
    );
    return 0;
  }

  let adopted = 0;
  for (const torrent of result.torrents) {
    if (deps.manualGrabs.hasTorrentHash(torrent.hash)) continue;

    const parsed = normalizeFeedItem({
      mediaType: 'tv',
      rawTitle: torrent.name,
    });
    if (parsed.season === undefined || parsed.episode === undefined) continue;
    if (!titlesMatch(parsed.normalizedTitle, show.normalizedTitle)) continue;

    try {
      deps.manualGrabs.record({
        normalizedTitle: show.normalizedTitle,
        season: parsed.season,
        episode: parsed.episode,
        source: 'adopted-transmission',
        rawTitle: torrent.name,
        transmissionTorrentHash: torrent.hash,
        transmissionTorrentId: torrent.id,
        showDisplayTitle: show.displayTitle,
      });
      adopted += 1;
    } catch (error) {
      log(`adoption: failed to record ${torrent.name}: ${formatError(error)}`);
    }
  }
  return adopted;
}

async function adoptFromFilesystem(
  show: TrackedShowRecord,
  deps: ReconcileShowLibraryDeps,
  log: (message: string) => void,
): Promise<number> {
  if (!deps.mediaShowsDir) return 0;

  let filePaths: string[];
  try {
    filePaths = await walkVideoFiles(deps.mediaShowsDir);
  } catch (error) {
    log(
      `adoption: filesystem walk failed for ${show.normalizedTitle}: ${formatError(error)}`,
    );
    return 0;
  }

  // Only ever compared against episodes this exact show already knows
  // about via some other source (a manual grab, or an already-adopted
  // torrent) — a file with no matching torrent hash has no natural dedup
  // key, so season+episode is the only thing available to avoid
  // re-recording the same file every time this sweep runs.
  const alreadyKnown = new Set(
    deps.manualGrabs
      .listForShow(show.normalizedTitle)
      .map((grab) => `${grab.season}:${grab.episode}`),
  );

  let adopted = 0;
  for (const filePath of filePaths) {
    const rawTitle = basename(filePath, extname(filePath));
    const parsed = normalizeFeedItem({ mediaType: 'tv', rawTitle });
    if (parsed.season === undefined || parsed.episode === undefined) continue;
    if (!titlesMatch(parsed.normalizedTitle, show.normalizedTitle)) continue;

    const key = `${parsed.season}:${parsed.episode}`;
    if (alreadyKnown.has(key)) continue;

    try {
      deps.manualGrabs.record({
        normalizedTitle: show.normalizedTitle,
        season: parsed.season,
        episode: parsed.episode,
        source: 'adopted-filesystem',
        rawTitle,
        transmissionTorrentHash: null,
        transmissionTorrentId: null,
        showDisplayTitle: show.displayTitle,
      });
      alreadyKnown.add(key);
      adopted += 1;
    } catch (error) {
      log(`adoption: failed to record ${filePath}: ${formatError(error)}`);
    }
  }
  return adopted;
}

async function walkVideoFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Directory vanished mid-walk, or was never created — not fatal to
      // the rest of the walk.
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (
        entry.isFile() &&
        VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
