import type { Database } from 'bun:sqlite';
import type { TvRule } from '../config';
import { normalizeFeedItem } from '../normalize';
import { TrackedShowsStore } from './store';

/** Same normalization RSS feed items go through, applied to a plain show
 * name instead — a config show name never has season/episode/quality
 * markers to strip, so this just cleans whitespace/symbols the same way,
 * keeping `tracked_shows.normalized_title` consistent with the
 * `normalized_title` candidate_state rows already use for the same show. */
export function normalizeShowName(name: string): string {
  return normalizeFeedItem({ mediaType: 'tv', rawTitle: name }).normalizedTitle;
}

/**
 * Idempotent sync from the watchlist (`config.tv`) into the tracked-show
 * ledger. Never overwrites an existing row (createIfMissing) — a show's
 * ledger history is never clobbered by a config reload or a repeat call.
 *
 * Called at daemon startup (handles the one-time backfill for shows added to
 * config before this table existed, plus the ordinary case of new shows
 * added since) and again after every successful `PUT /api/config` that
 * changes `tv.shows` (so "Add show" on the calendar route creates the ledger
 * row immediately, not just on next restart).
 *
 * `leftoverNormalizedTitles` backfills a bare ledger row (no matching
 * fields) for any show that only exists via historical `candidate_state`
 * rows and isn't in the current watchlist — e.g. a show removed from config
 * after it was already matched. Only meaningful for the one-time startup
 * backfill; omit on the post-config-write sync.
 */
export function syncTrackedShowsFromConfig(
  database: Database,
  tv: TvRule[],
  leftoverNormalizedTitles: string[] = [],
): void {
  const store = new TrackedShowsStore(database);
  // Lowercased: a candidate's normalizedTitle comes from an actual feed
  // item's raw title, not from config, so its casing can differ from the
  // config-derived one for the same show (e.g. config has "the mandalorian",
  // a matched release normalized to "The Mandalorian"). Comparing case-
  // sensitively here would create two separate PK rows in tracked_shows for
  // one real show — SQLite's TEXT primary key is case-sensitive, so
  // createIfMissing's INSERT OR IGNORE wouldn't catch it either.
  const seen = new Set<string>();

  for (const rule of tv) {
    const normalizedTitle = normalizeShowName(rule.name);
    if (normalizedTitle.length === 0) continue;
    seen.add(normalizedTitle.toLowerCase());
    store.createIfMissing({
      normalizedTitle,
      displayTitle: rule.name,
      matchPattern: rule.matchPattern ?? null,
      resolutions: rule.resolutions,
      codecs: rule.codecs,
    });
  }

  for (const normalizedTitle of leftoverNormalizedTitles) {
    if (normalizedTitle.length === 0) continue;
    const lower = normalizedTitle.toLowerCase();
    if (seen.has(lower)) continue;
    // Belt-and-suspenders beyond the in-memory `seen` set above: also check
    // the store directly, in case a differently-cased row already exists
    // from before this case-insensitive dedup existed.
    if (store.getByNormalizedTitleCaseInsensitive(normalizedTitle)) continue;
    seen.add(lower);
    store.createIfMissing({
      normalizedTitle,
      displayTitle: normalizedTitle,
      resolutions: [],
      codecs: [],
    });
  }
}
