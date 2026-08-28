import type { Database } from 'bun:sqlite';

/**
 * The tracked-show ledger — one row per show the operator has added, whether
 * or not the RSS pipeline has ever matched an episode for it yet.
 *
 * Before this table existed, "does this show exist for the UI" was 100%
 * derived from `candidate_state` (see buildShowBreakdowns in api.ts) — a show
 * added after its season already aired had zero candidate rows and was
 * therefore invisible to /shows and 404'd on manual grab, even though manual
 * grab exists specifically to backfill episodes the RSS pipeline missed.
 *
 * `match_pattern`/`resolutions_json`/`codecs_json` mirror `TvRule` (see
 * config.ts) rather than living in a separate table: a show you'd manually
 * backfill is, by definition, also one you want the RSS pipeline matching —
 * there's no real "tracked but not RSS-matched" state in practice. The
 * config file (`config.tv`) remains the RSS pipeline's actual source of
 * truth for matching (unchanged); this table is kept in sync with it
 * (src/tracked-shows/sync.ts) so the display/reconciliation/manual-grab
 * layer never has to depend on a candidate ever existing.
 */
export function ensureTrackedShowsSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS tracked_shows (
      normalized_title TEXT PRIMARY KEY,
      display_title TEXT NOT NULL,
      match_pattern TEXT,
      resolutions_json TEXT NOT NULL,
      codecs_json TEXT NOT NULL,
      added_at TEXT NOT NULL,
      last_reconciled_at TEXT
    );
  `);
}
