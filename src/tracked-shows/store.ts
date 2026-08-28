import type { Database } from 'bun:sqlite';

export type TrackedShowRecord = {
  normalizedTitle: string;
  displayTitle: string;
  matchPattern: string | null;
  resolutions: string[];
  codecs: string[];
  addedAt: string;
  lastReconciledAt: string | null;
};

export type UpsertTrackedShowInput = {
  normalizedTitle: string;
  displayTitle: string;
  matchPattern?: string | null;
  resolutions: string[];
  codecs: string[];
  addedAt?: string;
};

type TrackedShowRow = {
  normalized_title: string;
  display_title: string;
  match_pattern: string | null;
  resolutions_json: string;
  codecs_json: string;
  added_at: string;
  last_reconciled_at: string | null;
};

function rowToRecord(row: TrackedShowRow): TrackedShowRecord {
  return {
    normalizedTitle: row.normalized_title,
    displayTitle: row.display_title,
    matchPattern: row.match_pattern,
    resolutions: JSON.parse(row.resolutions_json) as string[],
    codecs: JSON.parse(row.codecs_json) as string[],
    addedAt: row.added_at,
    lastReconciledAt: row.last_reconciled_at,
  };
}

export class TrackedShowsStore {
  constructor(private readonly database: Database) {}

  /**
   * Creates the show if no row exists yet for this normalized title;
   * otherwise a no-op. Used both by the explicit "add show" flow and by the
   * config-sync pass (src/tracked-shows/sync.ts) — neither should clobber an
   * already-tracked show's `added_at`/`last_reconciled_at` history.
   */
  createIfMissing(input: UpsertTrackedShowInput): TrackedShowRecord {
    const addedAt = input.addedAt ?? new Date().toISOString();
    this.database
      .query(
        `INSERT OR IGNORE INTO tracked_shows (
          normalized_title, display_title, match_pattern, resolutions_json, codecs_json, added_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .run(
        input.normalizedTitle,
        input.displayTitle,
        input.matchPattern ?? null,
        JSON.stringify(input.resolutions),
        JSON.stringify(input.codecs),
        addedAt,
      );
    // INSERT OR IGNORE guarantees a row exists either way.
    return this.get(input.normalizedTitle)!;
  }

  get(normalizedTitle: string): TrackedShowRecord | undefined {
    const row = this.database
      .query(`SELECT * FROM tracked_shows WHERE normalized_title = ?1`)
      .get(normalizedTitle) as TrackedShowRow | null;
    return row ? rowToRecord(row) : undefined;
  }

  /** Case-insensitive lookup — mirrors how findEnrichedShowBySlug already
   * matches show slugs in api.ts. */
  getByNormalizedTitleCaseInsensitive(
    normalizedTitle: string,
  ): TrackedShowRecord | undefined {
    const needle = normalizedTitle.toLowerCase();
    return this.list().find(
      (show) => show.normalizedTitle.toLowerCase() === needle,
    );
  }

  list(): TrackedShowRecord[] {
    const rows = this.database
      .query(`SELECT * FROM tracked_shows ORDER BY added_at DESC`)
      .all() as TrackedShowRow[];
    return rows.map(rowToRecord);
  }

  markReconciled(normalizedTitle: string, reconciledAt: string): void {
    this.database
      .query(
        `UPDATE tracked_shows SET last_reconciled_at = ?2 WHERE normalized_title = ?1`,
      )
      .run(normalizedTitle, reconciledAt);
  }

  /** Untrack: removes the ledger row only. `candidate_state`/`manual_grabs`
   * history is left untouched — a past download isn't undone by this, only
   * future matching and visibility on /shows. Returns true if a row was
   * actually removed. */
  remove(normalizedTitle: string): boolean {
    const result = this.database
      .query(`DELETE FROM tracked_shows WHERE normalized_title = ?1`)
      .run(normalizedTitle);
    return result.changes > 0;
  }
}
