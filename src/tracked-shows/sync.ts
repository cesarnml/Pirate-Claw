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
 * Called at daemon startup (picking up config edits made outside the API)
 * and again after every successful `PUT /api/config` that changes
 * `tv.shows` (so "Add show" on the calendar route creates the ledger row
 * immediately, not just on next restart).
 *
 * The watchlist is the ONLY source a row is created from. This previously
 * also accepted a `leftoverNormalizedTitles` list that backfilled bare rows
 * from historical `candidate_state` titles absent from the watchlist. That
 * parameter is gone, not merely unused, because passing anything into it
 * re-arms a resurrection bug: untrack deliberately leaves candidate_state
 * intact, so any such backfill re-creates the ledger row on the next
 * restart and silently undoes the untrack — see the call site in
 * src/cli.ts for the full incident history.
 */
export function syncTrackedShowsFromConfig(
  database: Database,
  tv: TvRule[],
): void {
  const store = new TrackedShowsStore(database);

  for (const rule of tv) {
    const normalizedTitle = normalizeShowName(rule.name);
    if (normalizedTitle.length === 0) continue;
    store.createIfMissing({
      normalizedTitle,
      displayTitle: rule.name,
      matchPattern: rule.matchPattern ?? null,
      resolutions: rule.resolutions,
      codecs: rule.codecs,
    });
  }
}
