import { Database } from 'bun:sqlite';

import { ensurePlexSchema } from './plex/schema';
import type { TmdbMoviePublic } from './movie-api-types';
import { ensureTmdbSchema } from './tmdb/schema';
import type { TmdbTvShowMeta } from './tv-api-types';
import type { RawFeedItem } from './feed';
import type { NormalizedFeedItem } from './normalize';

export type CandidateStatus = 'queued' | 'failed' | 'skipped_duplicate';
export type RunStatus = 'running' | 'completed' | 'failed';
export type PirateClawDisposition = 'removed' | 'deleted';

export type FeedItemOutcomeStatus =
  | 'queued'
  | 'failed'
  | 'skipped_duplicate'
  | 'skipped_no_match';

export type CandidateMatchRecord = {
  ruleName: string;
  identityKey: string;
  score: number;
  reasons: string[];
  item: NormalizedFeedItem;
};

export type RunRecord = {
  id: number;
  startedAt: string;
  status: RunStatus;
  completedAt?: string;
};

export type RunSummaryRecord = RunRecord & {
  counts: Record<FeedItemOutcomeStatus, number>;
};

export type FeedItemRecord = RawFeedItem & {
  id: number;
  runId: number;
};

export type FeedItemOutcomeRecord = {
  id: number;
  runId: number;
  feedItemId?: number;
  status: FeedItemOutcomeStatus;
  identityKey?: string;
  ruleName?: string;
  message?: string;
  createdAt: string;
};

export type CandidateStateRecord = {
  identityKey: string;
  mediaType: NormalizedFeedItem['mediaType'];
  status: CandidateStatus;
  queuedAt?: string;
  pirateClawDisposition?: PirateClawDisposition;
  reconciledAt?: string;
  transmissionTorrentId?: number;
  transmissionTorrentName?: string;
  transmissionTorrentHash?: string;
  transmissionStatusCode?: number;
  transmissionPercentDone?: number;
  transmissionDoneDate?: string;
  transmissionDownloadDir?: string;
  ruleName: string;
  score: number;
  reasons: string[];
  rawTitle: string;
  normalizedTitle: string;
  season?: number;
  episode?: number;
  year?: number;
  resolution?: string;
  codec?: NormalizedFeedItem['codec'];
  feedName: string;
  guidOrLink: string;
  publishedAt: string;
  downloadUrl: string;
  firstSeenRunId: number;
  lastSeenRunId: number;
  lastFeedItemId?: number;
  updatedAt: string;
  /** Present on API responses when TMDB cache has a hit for this identity. */
  tmdb?: TmdbMoviePublic | TmdbTvShowMeta;
};

export type RecordCandidateOutcomeInput = {
  runId: number;
  feedItemId?: number;
  feedItem: RawFeedItem;
  match: CandidateMatchRecord;
  status: CandidateStatus;
  transmissionTorrentId?: number;
  transmissionTorrentName?: string;
  transmissionTorrentHash?: string;
  updatedAt?: string;
};

export type RecordFeedItemOutcomeInput = {
  runId: number;
  feedItemId?: number;
  status: FeedItemOutcomeStatus;
  identityKey?: string;
  ruleName?: string;
  message?: string;
  createdAt?: string;
};

export type SkippedOutcomeRecord = {
  id: number;
  runId: number;
  status: 'skipped_no_match';
  recordedAt: string;
  title: string | null;
  feedName: string | null;
};

export type RecordCandidateReconciliationInput = {
  identityKey: string;
  transmissionTorrentName?: string;
  transmissionStatusCode?: number;
  transmissionPercentDone?: number;
  transmissionDoneDate?: string;
  transmissionDownloadDir?: string;
  reconciledAt?: string;
};

export type DistinctUnmatchedOrFailedOutcome = {
  id: number;
  runId: number;
  status: string;
  recordedAt: string;
  title: string | null;
  feedName: string | null;
  guidOrLink: string | null;
};

export type DistinctOutcomeFilters = {
  movieYears: number[];
  tvResolutions: string[];
  tvCodecs: string[];
  feedMediaTypes: Record<string, 'movie' | 'tv'>;
};

export type Repository = {
  startRun(startedAt?: string): RunRecord;
  getRun(runId: number): RunRecord | undefined;
  completeRun(runId: number, completedAt?: string): RunRecord;
  failRun(runId: number, failedAt?: string): RunRecord;
  recordFeedItem(runId: number, item: RawFeedItem): FeedItemRecord;
  getCandidateState(identityKey: string): CandidateStateRecord | undefined;
  isCandidateQueued(identityKey: string): boolean;
  recordCandidateOutcome(
    input: RecordCandidateOutcomeInput,
  ): CandidateStateRecord;
  recordCandidateReconciliation(
    input: RecordCandidateReconciliationInput,
  ): CandidateStateRecord;
  recordFeedItemOutcome(
    input: RecordFeedItemOutcomeInput,
  ): FeedItemOutcomeRecord;
  listFeedItemOutcomes(runId: number): FeedItemOutcomeRecord[];
  listRecentRunSummaries(limit?: number): RunSummaryRecord[];
  listCandidateStates(limit?: number): CandidateStateRecord[];
  listReconcilableCandidates(limit?: number): CandidateStateRecord[];
  listRetryableCandidates(limit?: number): CandidateStateRecord[];
  listSkippedNoMatchOutcomes(days: number): SkippedOutcomeRecord[];
  listDistinctUnmatchedAndFailedOutcomes(
    days: number,
    filters?: DistinctOutcomeFilters,
  ): DistinctUnmatchedOrFailedOutcome[];
  setPirateClawDisposition(
    identityKey: string,
    disposition: PirateClawDisposition,
  ): void;
  trySetPirateClawDispositionIfUnset(
    identityKey: string,
    disposition: PirateClawDisposition,
  ): boolean;
};

export const DEFAULT_DATABASE_PATH = 'pirate-claw.db';

export function openDatabase(path = DEFAULT_DATABASE_PATH): Database {
  return new Database(path, { create: true, strict: true });
}

export function openDatabaseReadOnly(path = DEFAULT_DATABASE_PATH): Database {
  return new Database(path, { readonly: true, strict: true });
}

export function ensureSchema(database: Database): void {
  database.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS feed_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      feed_name TEXT NOT NULL,
      guid_or_link TEXT NOT NULL,
      raw_title TEXT NOT NULL,
      published_at TEXT NOT NULL,
      download_url TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS candidate_state (
      identity_key TEXT PRIMARY KEY,
      media_type TEXT NOT NULL,
      status TEXT NOT NULL,
      queued_at TEXT,
      pirate_claw_disposition TEXT,
      reconciled_at TEXT,
      transmission_torrent_id INTEGER,
      transmission_torrent_name TEXT,
      transmission_torrent_hash TEXT,
      transmission_status_code INTEGER,
      transmission_percent_done REAL,
      transmission_done_date TEXT,
      transmission_download_dir TEXT,
      rule_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      reasons_json TEXT NOT NULL,
      raw_title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      season INTEGER,
      episode INTEGER,
      year INTEGER,
      resolution TEXT,
      codec TEXT,
      feed_name TEXT NOT NULL,
      guid_or_link TEXT NOT NULL,
      published_at TEXT NOT NULL,
      download_url TEXT NOT NULL,
      first_seen_run_id INTEGER NOT NULL REFERENCES runs(id),
      last_seen_run_id INTEGER NOT NULL REFERENCES runs(id),
      last_feed_item_id INTEGER REFERENCES feed_items(id),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feed_item_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      feed_item_id INTEGER REFERENCES feed_items(id),
      status TEXT NOT NULL,
      identity_key TEXT,
      rule_name TEXT,
      message TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const hasRunStatusColumn =
    (database
      .query(`SELECT 1 FROM pragma_table_info('runs') WHERE name = 'status'`)
      .get() as { 1: number } | null | undefined) !== null;

  if (!hasRunStatusColumn) {
    database.run(
      `ALTER TABLE runs ADD COLUMN status TEXT NOT NULL DEFAULT 'running'`,
    );
  }

  ensureDropCandidateStateColumn(database, 'lifecycle_status');
  ensureCandidateStateColumn(database, 'pirate_claw_disposition', 'TEXT');
  ensureCandidateStateColumn(database, 'reconciled_at', 'TEXT');
  ensureCandidateStateColumn(database, 'transmission_torrent_id', 'INTEGER');
  ensureCandidateStateColumn(database, 'transmission_torrent_name', 'TEXT');
  ensureCandidateStateColumn(database, 'transmission_torrent_hash', 'TEXT');
  ensureCandidateStateColumn(database, 'transmission_status_code', 'INTEGER');
  ensureCandidateStateColumn(database, 'transmission_percent_done', 'REAL');
  ensureCandidateStateColumn(database, 'transmission_done_date', 'TEXT');
  ensureCandidateStateColumn(database, 'transmission_download_dir', 'TEXT');

  ensureTmdbSchema(database);
  ensurePlexSchema(database);
}

export function hasStatusSchema(database: Database): boolean {
  const requiredTables = ['runs', 'candidate_state', 'feed_item_outcomes'];

  for (const tableName of requiredTables) {
    const hasTable =
      (database
        .query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1`)
        .get(tableName) as { 1: number } | null | undefined) !== null;

    if (!hasTable) {
      return false;
    }
  }

  const hasRunStatusColumn =
    (database
      .query(`SELECT 1 FROM pragma_table_info('runs') WHERE name = 'status'`)
      .get() as { 1: number } | null | undefined) !== null;

  return hasRunStatusColumn;
}

export function createRepository(database: Database): Repository {
  const listDistinctUnmatchedAndFailedOutcomesStatement = database.prepare(
    `SELECT
      fo.id,
      fo.run_id AS runId,
      fo.status,
      fo.created_at AS recordedAt,
      fi.raw_title AS title,
      fi.feed_name AS feedName,
      fi.guid_or_link AS guidOrLink
    FROM feed_item_outcomes fo
    LEFT JOIN feed_items fi ON fo.feed_item_id = fi.id
    WHERE (fo.status = 'skipped_no_match' OR fo.status = 'failed')
      AND fo.created_at >= datetime('now', '-' || ?1 || ' days')
    GROUP BY fi.guid_or_link, fi.raw_title
    ORDER BY fo.created_at DESC`,
  );
  const insertRun = database.query(
    `INSERT INTO runs (started_at, status) VALUES (?1, 'running')`,
  );
  const selectRun = database.query(
    `SELECT
      id,
      started_at AS startedAt,
      status,
      completed_at AS completedAt
    FROM runs
    WHERE id = ?1`,
  );
  const completeRunStatement = database.query(
    `UPDATE runs
    SET completed_at = ?2,
        status = 'completed'
    WHERE id = ?1`,
  );
  const failRunStatement = database.query(
    `UPDATE runs
    SET completed_at = ?2,
        status = 'failed'
    WHERE id = ?1`,
  );
  const insertFeedItem = database.query(
    `INSERT INTO feed_items (
      run_id,
      feed_name,
      guid_or_link,
      raw_title,
      published_at,
      download_url
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  );
  const selectFeedItem = database.query(
    `SELECT
      id,
      run_id AS runId,
      feed_name AS feedName,
      guid_or_link AS guidOrLink,
      raw_title AS rawTitle,
      published_at AS publishedAt,
      download_url AS downloadUrl
    FROM feed_items
    WHERE id = ?1`,
  );
  const selectCandidateState = database.query(
    `SELECT
      identity_key AS identityKey,
      media_type AS mediaType,
      status,
      queued_at AS queuedAt,
      pirate_claw_disposition AS pirateClawDisposition,
      reconciled_at AS reconciledAt,
      transmission_torrent_id AS transmissionTorrentId,
      transmission_torrent_name AS transmissionTorrentName,
      transmission_torrent_hash AS transmissionTorrentHash,
      transmission_status_code AS transmissionStatusCode,
      transmission_percent_done AS transmissionPercentDone,
      transmission_done_date AS transmissionDoneDate,
      transmission_download_dir AS transmissionDownloadDir,
      rule_name AS ruleName,
      score,
      reasons_json AS reasonsJson,
      raw_title AS rawTitle,
      normalized_title AS normalizedTitle,
      season,
      episode,
      year,
      resolution,
      codec,
      feed_name AS feedName,
      guid_or_link AS guidOrLink,
      published_at AS publishedAt,
      download_url AS downloadUrl,
      first_seen_run_id AS firstSeenRunId,
      last_seen_run_id AS lastSeenRunId,
      last_feed_item_id AS lastFeedItemId,
      updated_at AS updatedAt
    FROM candidate_state
    WHERE identity_key = ?1`,
  );
  const upsertCandidateState = database.query(
    `INSERT INTO candidate_state (
      identity_key,
      media_type,
      status,
      queued_at,
      reconciled_at,
      transmission_torrent_id,
      transmission_torrent_name,
      transmission_torrent_hash,
      transmission_status_code,
      transmission_percent_done,
      transmission_done_date,
      transmission_download_dir,
      rule_name,
      score,
      reasons_json,
      raw_title,
      normalized_title,
      season,
      episode,
      year,
      resolution,
      codec,
      feed_name,
      guid_or_link,
      published_at,
      download_url,
      first_seen_run_id,
      last_seen_run_id,
      last_feed_item_id,
      updated_at,
      pirate_claw_disposition
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
      ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22,
      ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31
    )
    ON CONFLICT(identity_key) DO UPDATE SET
      media_type = excluded.media_type,
      status = excluded.status,
      queued_at = COALESCE(candidate_state.queued_at, excluded.queued_at),
      pirate_claw_disposition = COALESCE(
        candidate_state.pirate_claw_disposition,
        excluded.pirate_claw_disposition
      ),
      reconciled_at = COALESCE(
        excluded.reconciled_at,
        candidate_state.reconciled_at
      ),
      transmission_torrent_id = COALESCE(
        candidate_state.transmission_torrent_id,
        excluded.transmission_torrent_id
      ),
      transmission_torrent_name = COALESCE(
        candidate_state.transmission_torrent_name,
        excluded.transmission_torrent_name
      ),
      transmission_torrent_hash = COALESCE(
        candidate_state.transmission_torrent_hash,
        excluded.transmission_torrent_hash
      ),
      transmission_status_code = COALESCE(
        excluded.transmission_status_code,
        candidate_state.transmission_status_code
      ),
      transmission_percent_done = COALESCE(
        excluded.transmission_percent_done,
        candidate_state.transmission_percent_done
      ),
      transmission_done_date = COALESCE(
        excluded.transmission_done_date,
        candidate_state.transmission_done_date
      ),
      transmission_download_dir = COALESCE(
        excluded.transmission_download_dir,
        candidate_state.transmission_download_dir
      ),
      rule_name = excluded.rule_name,
      score = excluded.score,
      reasons_json = excluded.reasons_json,
      raw_title = excluded.raw_title,
      normalized_title = excluded.normalized_title,
      season = excluded.season,
      episode = excluded.episode,
      year = excluded.year,
      resolution = excluded.resolution,
      codec = excluded.codec,
      feed_name = excluded.feed_name,
      guid_or_link = excluded.guid_or_link,
      published_at = excluded.published_at,
      download_url = excluded.download_url,
      last_seen_run_id = excluded.last_seen_run_id,
      last_feed_item_id = COALESCE(
        excluded.last_feed_item_id,
        candidate_state.last_feed_item_id
      ),
      updated_at = excluded.updated_at`,
  );
  const setPirateClawDispositionStatement = database.query(
    `UPDATE candidate_state SET pirate_claw_disposition = ?2 WHERE identity_key = ?1`,
  );
  const trySetPirateClawDispositionIfUnsetStatement = database.query(
    `UPDATE candidate_state SET pirate_claw_disposition = ?2 WHERE identity_key = ?1 AND pirate_claw_disposition IS NULL`,
  );
  const reconcileCandidateStateStatement = database.query(
    `UPDATE candidate_state
    SET reconciled_at = ?2,
        transmission_torrent_name = COALESCE(?3, transmission_torrent_name),
        transmission_status_code = ?4,
        transmission_percent_done = ?5,
        transmission_done_date = ?6,
        transmission_download_dir = ?7
    WHERE identity_key = ?1`,
  );
  const insertFeedItemOutcome = database.query(
    `INSERT INTO feed_item_outcomes (
      run_id,
      feed_item_id,
      status,
      identity_key,
      rule_name,
      message,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  );
  const selectFeedItemOutcome = database.query(
    `SELECT
      id,
      run_id AS runId,
      feed_item_id AS feedItemId,
      status,
      identity_key AS identityKey,
      rule_name AS ruleName,
      message,
      created_at AS createdAt
    FROM feed_item_outcomes
    WHERE id = ?1`,
  );
  const listFeedItemOutcomesStatement = database.query(
    `SELECT
      id,
      run_id AS runId,
      feed_item_id AS feedItemId,
      status,
      identity_key AS identityKey,
      rule_name AS ruleName,
      message,
      created_at AS createdAt
    FROM feed_item_outcomes
    WHERE run_id = ?1
    ORDER BY id ASC`,
  );
  const listRecentRunSummariesStatement = database.query(
    `SELECT
      runs.id,
      runs.started_at AS startedAt,
      runs.status,
      runs.completed_at AS completedAt,
      COALESCE(SUM(CASE WHEN feed_item_outcomes.status = 'queued' THEN 1 ELSE 0 END), 0) AS queuedCount,
      COALESCE(SUM(CASE WHEN feed_item_outcomes.status = 'failed' THEN 1 ELSE 0 END), 0) AS failedCount,
      COALESCE(SUM(CASE WHEN feed_item_outcomes.status = 'skipped_duplicate' THEN 1 ELSE 0 END), 0) AS skippedDuplicateCount,
      COALESCE(SUM(CASE WHEN feed_item_outcomes.status = 'skipped_no_match' THEN 1 ELSE 0 END), 0) AS skippedNoMatchCount
    FROM runs
    LEFT JOIN feed_item_outcomes ON feed_item_outcomes.run_id = runs.id
    GROUP BY runs.id
    ORDER BY runs.id DESC
    LIMIT ?1`,
  );
  const listCandidateStatesStatement = database.query(
    `SELECT
      identity_key AS identityKey,
      media_type AS mediaType,
      status,
      queued_at AS queuedAt,
      pirate_claw_disposition AS pirateClawDisposition,
      reconciled_at AS reconciledAt,
      transmission_torrent_id AS transmissionTorrentId,
      transmission_torrent_name AS transmissionTorrentName,
      transmission_torrent_hash AS transmissionTorrentHash,
      transmission_status_code AS transmissionStatusCode,
      transmission_percent_done AS transmissionPercentDone,
      transmission_done_date AS transmissionDoneDate,
      transmission_download_dir AS transmissionDownloadDir,
      rule_name AS ruleName,
      score,
      reasons_json AS reasonsJson,
      raw_title AS rawTitle,
      normalized_title AS normalizedTitle,
      season,
      episode,
      year,
      resolution,
      codec,
      feed_name AS feedName,
      guid_or_link AS guidOrLink,
      published_at AS publishedAt,
      download_url AS downloadUrl,
      first_seen_run_id AS firstSeenRunId,
      last_seen_run_id AS lastSeenRunId,
      last_feed_item_id AS lastFeedItemId,
      updated_at AS updatedAt
    FROM candidate_state
    ORDER BY updated_at DESC, identity_key ASC
    LIMIT ?1`,
  );
  const listReconcilableCandidatesStatement = database.query(
    `SELECT
      identity_key AS identityKey,
      media_type AS mediaType,
      status,
      queued_at AS queuedAt,
      pirate_claw_disposition AS pirateClawDisposition,
      reconciled_at AS reconciledAt,
      transmission_torrent_id AS transmissionTorrentId,
      transmission_torrent_name AS transmissionTorrentName,
      transmission_torrent_hash AS transmissionTorrentHash,
      transmission_status_code AS transmissionStatusCode,
      transmission_percent_done AS transmissionPercentDone,
      transmission_done_date AS transmissionDoneDate,
      transmission_download_dir AS transmissionDownloadDir,
      rule_name AS ruleName,
      score,
      reasons_json AS reasonsJson,
      raw_title AS rawTitle,
      normalized_title AS normalizedTitle,
      season,
      episode,
      year,
      resolution,
      codec,
      feed_name AS feedName,
      guid_or_link AS guidOrLink,
      published_at AS publishedAt,
      download_url AS downloadUrl,
      first_seen_run_id AS firstSeenRunId,
      last_seen_run_id AS lastSeenRunId,
      last_feed_item_id AS lastFeedItemId,
      updated_at AS updatedAt
    FROM candidate_state
    WHERE queued_at IS NOT NULL
      AND pirate_claw_disposition IS NULL
      AND (
        transmission_torrent_id IS NOT NULL
        OR transmission_torrent_hash IS NOT NULL
      )
    ORDER BY identity_key ASC
    LIMIT ?1`,
  );
  const listSkippedNoMatchOutcomesStatement = database.prepare(
    `SELECT
      fo.id,
      fo.run_id AS runId,
      fo.status,
      fo.created_at AS recordedAt,
      fi.raw_title AS title,
      fi.feed_name AS feedName
    FROM feed_item_outcomes fo
    LEFT JOIN feed_items fi ON fo.feed_item_id = fi.id
    WHERE fo.status = 'skipped_no_match'
      AND fo.created_at >= datetime('now', '-' || ?1 || ' days')
    ORDER BY fo.created_at DESC`,
  );

  const listRetryableCandidatesStatement = database.query(
    `SELECT
      identity_key AS identityKey,
      media_type AS mediaType,
      status,
      queued_at AS queuedAt,
      pirate_claw_disposition AS pirateClawDisposition,
      reconciled_at AS reconciledAt,
      transmission_torrent_id AS transmissionTorrentId,
      transmission_torrent_name AS transmissionTorrentName,
      transmission_torrent_hash AS transmissionTorrentHash,
      transmission_status_code AS transmissionStatusCode,
      transmission_percent_done AS transmissionPercentDone,
      transmission_done_date AS transmissionDoneDate,
      transmission_download_dir AS transmissionDownloadDir,
      rule_name AS ruleName,
      score,
      reasons_json AS reasonsJson,
      raw_title AS rawTitle,
      normalized_title AS normalizedTitle,
      season,
      episode,
      year,
      resolution,
      codec,
      feed_name AS feedName,
      guid_or_link AS guidOrLink,
      published_at AS publishedAt,
      download_url AS downloadUrl,
      first_seen_run_id AS firstSeenRunId,
      last_seen_run_id AS lastSeenRunId,
      last_feed_item_id AS lastFeedItemId,
      updated_at AS updatedAt
    FROM candidate_state
    WHERE status = 'failed'
      AND download_url <> ''
    ORDER BY updated_at ASC, identity_key ASC
    LIMIT ?1`,
  );

  return {
    /**
     * Returns distinct skipped_no_match and failed outcomes by guid_or_link and title.
     * Used for dashboard unmatched feed events table.
     */
    listDistinctUnmatchedAndFailedOutcomes(
      days: number,
      filters?: DistinctOutcomeFilters,
    ): DistinctUnmatchedOrFailedOutcome[] {
      const rows = filters
        ? (database
            .query(buildDistinctOutcomesFilteredSql(filters))
            .all(
              days,
              ...buildDistinctOutcomesFilteredParams(filters),
            ) as DistinctUnmatchedOrFailedOutcome[])
        : (listDistinctUnmatchedAndFailedOutcomesStatement.all(
            days,
          ) as DistinctUnmatchedOrFailedOutcome[]);
      return rows.map((row) => ({
        id: Number(row.id),
        runId: Number(row.runId),
        status: row.status,
        recordedAt: row.recordedAt,
        title: row.title,
        feedName: row.feedName,
        guidOrLink: row.guidOrLink,
      }));
    },
    startRun(startedAt = new Date().toISOString()): RunRecord {
      insertRun.run(startedAt);
      const row = selectRun.get(lastInsertedRowId(database)) as
        | RunRow
        | null
        | undefined;
      return mapRunRow(requireRow(row, 'run'));
    },

    getRun(runId: number): RunRecord | undefined {
      const row = selectRun.get(runId) as RunRow | null | undefined;
      return row ? mapRunRow(row) : undefined;
    },

    completeRun(
      runId: number,
      completedAt = new Date().toISOString(),
    ): RunRecord {
      completeRunStatement.run(runId, completedAt);
      return mapRunRow(
        requireRow(selectRun.get(runId) as RunRow | null | undefined, 'run'),
      );
    },

    failRun(runId: number, failedAt = new Date().toISOString()): RunRecord {
      failRunStatement.run(runId, failedAt);
      return mapRunRow(
        requireRow(selectRun.get(runId) as RunRow | null | undefined, 'run'),
      );
    },

    recordFeedItem(runId: number, item: RawFeedItem): FeedItemRecord {
      insertFeedItem.run(
        runId,
        item.feedName,
        item.guidOrLink,
        item.rawTitle,
        item.publishedAt,
        item.downloadUrl,
      );
      const row = selectFeedItem.get(lastInsertedRowId(database)) as
        | FeedItemRow
        | null
        | undefined;
      return mapFeedItemRow(requireRow(row, 'feed item'));
    },

    getCandidateState(identityKey: string): CandidateStateRecord | undefined {
      const row = selectCandidateState.get(identityKey) as
        | CandidateStateRow
        | null
        | undefined;
      return row ? mapCandidateStateRow(row) : undefined;
    },

    isCandidateQueued(identityKey: string): boolean {
      return this.getCandidateState(identityKey)?.queuedAt !== undefined;
    },

    recordCandidateOutcome(
      input: RecordCandidateOutcomeInput,
    ): CandidateStateRecord {
      const updatedAt = input.updatedAt ?? new Date().toISOString();
      const queuedAt = input.status === 'queued' ? updatedAt : null;

      upsertCandidateState.run(
        input.match.identityKey,
        input.match.item.mediaType,
        input.status,
        queuedAt,
        null,
        input.transmissionTorrentId ?? null,
        input.transmissionTorrentName ?? null,
        input.transmissionTorrentHash ?? null,
        null,
        null,
        null,
        null,
        input.match.ruleName,
        input.match.score,
        JSON.stringify(input.match.reasons),
        input.feedItem.rawTitle,
        input.match.item.normalizedTitle,
        input.match.item.season ?? null,
        input.match.item.episode ?? null,
        input.match.item.year ?? null,
        input.match.item.resolution ?? null,
        input.match.item.codec ?? null,
        input.feedItem.feedName,
        input.feedItem.guidOrLink,
        input.feedItem.publishedAt,
        input.feedItem.downloadUrl,
        input.runId,
        input.runId,
        input.feedItemId ?? null,
        updatedAt,
        null,
      );

      return mapCandidateStateRow(
        requireRow(
          selectCandidateState.get(input.match.identityKey) as
            | CandidateStateRow
            | null
            | undefined,
          'candidate state',
        ),
      );
    },

    recordCandidateReconciliation(
      input: RecordCandidateReconciliationInput,
    ): CandidateStateRecord {
      const reconciledAt = input.reconciledAt ?? new Date().toISOString();

      reconcileCandidateStateStatement.run(
        input.identityKey,
        reconciledAt,
        input.transmissionTorrentName ?? null,
        input.transmissionStatusCode ?? null,
        input.transmissionPercentDone ?? null,
        input.transmissionDoneDate ?? null,
        input.transmissionDownloadDir ?? null,
      );

      return mapCandidateStateRow(
        requireRow(
          selectCandidateState.get(input.identityKey) as
            | CandidateStateRow
            | null
            | undefined,
          'candidate state',
        ),
      );
    },

    recordFeedItemOutcome(
      input: RecordFeedItemOutcomeInput,
    ): FeedItemOutcomeRecord {
      const createdAt = input.createdAt ?? new Date().toISOString();

      insertFeedItemOutcome.run(
        input.runId,
        input.feedItemId ?? null,
        input.status,
        input.identityKey ?? null,
        input.ruleName ?? null,
        input.message ?? null,
        createdAt,
      );

      return mapFeedItemOutcomeRow(
        requireRow(
          selectFeedItemOutcome.get(lastInsertedRowId(database)) as
            | FeedItemOutcomeRow
            | null
            | undefined,
          'feed item outcome',
        ),
      );
    },

    listFeedItemOutcomes(runId: number): FeedItemOutcomeRecord[] {
      return (
        listFeedItemOutcomesStatement.all(runId) as FeedItemOutcomeRow[]
      ).map(mapFeedItemOutcomeRow);
    },

    listRecentRunSummaries(limit = 5): RunSummaryRecord[] {
      return (
        listRecentRunSummariesStatement.all(limit) as RunSummaryRow[]
      ).map(mapRunSummaryRow);
    },

    listCandidateStates(limit = 20): CandidateStateRecord[] {
      return (
        listCandidateStatesStatement.all(limit) as CandidateStateRow[]
      ).map(mapCandidateStateRow);
    },

    listReconcilableCandidates(limit = 1000): CandidateStateRecord[] {
      return (
        listReconcilableCandidatesStatement.all(limit) as CandidateStateRow[]
      ).map(mapCandidateStateRow);
    },

    listRetryableCandidates(limit = 1000): CandidateStateRecord[] {
      return (
        listRetryableCandidatesStatement.all(limit) as CandidateStateRow[]
      ).map(mapCandidateStateRow);
    },

    setPirateClawDisposition(
      identityKey: string,
      disposition: PirateClawDisposition,
    ): void {
      setPirateClawDispositionStatement.run(identityKey, disposition);
    },

    trySetPirateClawDispositionIfUnset(
      identityKey: string,
      disposition: PirateClawDisposition,
    ): boolean {
      const result = trySetPirateClawDispositionIfUnsetStatement.run(
        identityKey,
        disposition,
      );
      return (result as { changes: number }).changes === 1;
    },

    listSkippedNoMatchOutcomes(days: number): SkippedOutcomeRecord[] {
      type Row = {
        id: number;
        runId: number;
        status: 'skipped_no_match';
        recordedAt: string;
        title: string | null;
        feedName: string | null;
      };
      return (listSkippedNoMatchOutcomesStatement.all(days) as Row[]).map(
        (row) => ({
          id: Number(row.id),
          runId: Number(row.runId),
          status: row.status,
          recordedAt: row.recordedAt,
          title: row.title,
          feedName: row.feedName,
        }),
      );
    },
  };
}

function buildDistinctOutcomesFilteredSql(
  filters: DistinctOutcomeFilters,
): string {
  const movieFeeds = Object.entries(filters.feedMediaTypes)
    .filter(([, mediaType]) => mediaType === 'movie')
    .map(([feedName]) => feedName);
  const tvFeeds = Object.entries(filters.feedMediaTypes)
    .filter(([, mediaType]) => mediaType === 'tv')
    .map(([feedName]) => feedName);

  const movieFeedClause = buildInClause('fi.feed_name', movieFeeds.length);
  const tvFeedClause = buildInClause('fi.feed_name', tvFeeds.length);

  const movieYearClauses = filters.movieYears.map(
    () =>
      "(fi.raw_title LIKE '%(' || ? || ')%' OR fi.raw_title LIKE '% ' || ? || ' %')",
  );
  const tvResolutionClauses = filters.tvResolutions.map(
    () => "LOWER(fi.raw_title) LIKE '%' || ? || '%'",
  );
  const tvCodecClauses = expandCodecAliases(filters.tvCodecs).map(
    () => "LOWER(fi.raw_title) LIKE '%' || ? || '%'",
  );

  const movieYearClause =
    movieYearClauses.length > 0 ? `(${movieYearClauses.join(' OR ')})` : '0';
  const tvResolutionClause =
    tvResolutionClauses.length > 0
      ? `(${tvResolutionClauses.join(' OR ')})`
      : '0';
  const tvCodecClause =
    tvCodecClauses.length > 0 ? `(${tvCodecClauses.join(' OR ')})` : '0';

  const skippedNoMatchFilter = `(
      (
        ${movieFeedClause}
        AND ${movieYearClause}
      )
      OR
      (
        ${tvFeedClause}
        AND ${tvResolutionClause}
        AND ${tvCodecClause}
      )
    )`;

  return `SELECT
      fo.id,
      fo.run_id AS runId,
      fo.status,
      fo.created_at AS recordedAt,
      fi.raw_title AS title,
      fi.feed_name AS feedName,
      fi.guid_or_link AS guidOrLink
    FROM feed_item_outcomes fo
    LEFT JOIN feed_items fi ON fo.feed_item_id = fi.id
    WHERE fo.created_at >= datetime('now', '-' || ?1 || ' days')
      AND (
        fo.status = 'failed'
        OR (
          fo.status = 'skipped_no_match'
          AND ${skippedNoMatchFilter}
        )
      )
    GROUP BY fi.guid_or_link, fi.raw_title
    ORDER BY fo.created_at DESC`;
}

function buildDistinctOutcomesFilteredParams(
  filters: DistinctOutcomeFilters,
): Array<string | number> {
  const movieFeeds = Object.entries(filters.feedMediaTypes)
    .filter(([, mediaType]) => mediaType === 'movie')
    .map(([feedName]) => feedName);
  const tvFeeds = Object.entries(filters.feedMediaTypes)
    .filter(([, mediaType]) => mediaType === 'tv')
    .map(([feedName]) => feedName);
  const codecAliases = expandCodecAliases(filters.tvCodecs);

  const params: Array<string | number> = [...movieFeeds];
  for (const year of filters.movieYears) {
    params.push(year, year);
  }
  params.push(...tvFeeds);
  params.push(...filters.tvResolutions.map((value) => value.toLowerCase()));
  params.push(...codecAliases.map((value) => value.toLowerCase()));
  return params;
}

function buildInClause(column: string, count: number): string {
  if (count === 0) return '0';
  return `${column} IN (${new Array(count).fill('?').join(', ')})`;
}

function expandCodecAliases(codecs: string[]): string[] {
  const aliases = new Set<string>();
  for (const codec of codecs) {
    const normalized = codec.toLowerCase();
    aliases.add(normalized);
    if (normalized === 'x264') aliases.add('h264');
    if (normalized === 'h264') aliases.add('x264');
    if (normalized === 'x265') {
      aliases.add('h265');
      aliases.add('hevc');
    }
    if (normalized === 'h265') {
      aliases.add('x265');
      aliases.add('hevc');
    }
    if (normalized === 'hevc') {
      aliases.add('x265');
      aliases.add('h265');
    }
  }
  return [...aliases];
}

function lastInsertedRowId(database: Database): number {
  return Number(
    requireRow(
      database.query('SELECT last_insert_rowid() AS id').get() as
        | { id: number }
        | null
        | undefined,
      'last insert row id',
    ).id,
  );
}

function ensureCandidateStateColumn(
  database: Database,
  columnName: string,
  columnType: 'INTEGER' | 'REAL' | 'TEXT',
): void {
  const hasColumn =
    (database
      .query(
        `SELECT 1 FROM pragma_table_info('candidate_state') WHERE name = ?1`,
      )
      .get(columnName) as { 1: number } | null | undefined) !== null;

  if (!hasColumn) {
    database.run(
      `ALTER TABLE candidate_state ADD COLUMN ${columnName} ${columnType}`,
    );
  }
}

function ensureDropCandidateStateColumn(
  database: Database,
  columnName: string,
): void {
  const hasColumn =
    (database
      .query(
        `SELECT 1 FROM pragma_table_info('candidate_state') WHERE name = ?1`,
      )
      .get(columnName) as { 1: number } | null | undefined) !== null;

  if (hasColumn) {
    database.run(`ALTER TABLE candidate_state DROP COLUMN ${columnName}`);
  }
}

function requireRow<T>(row: T | null | undefined, label: string): T {
  if (!row) {
    throw new Error(`Failed to load ${label} row.`);
  }

  return row;
}

function mapRunRow(row: {
  id: number;
  startedAt: string;
  status: RunStatus;
  completedAt: string | null;
}): RunRecord {
  return {
    id: Number(row.id),
    startedAt: row.startedAt,
    status: row.status,
    completedAt: row.completedAt ?? undefined,
  };
}

function mapRunSummaryRow(row: RunSummaryRow): RunSummaryRecord {
  return {
    ...mapRunRow(row),
    counts: {
      queued: Number(row.queuedCount),
      failed: Number(row.failedCount),
      skipped_duplicate: Number(row.skippedDuplicateCount),
      skipped_no_match: Number(row.skippedNoMatchCount),
    },
  };
}

function mapFeedItemRow(row: FeedItemRow): FeedItemRecord {
  return {
    id: Number(row.id),
    runId: Number(row.runId),
    feedName: row.feedName,
    guidOrLink: row.guidOrLink,
    rawTitle: row.rawTitle,
    publishedAt: row.publishedAt,
    downloadUrl: row.downloadUrl,
  };
}

function mapCandidateStateRow(row: CandidateStateRow): CandidateStateRecord {
  return {
    identityKey: row.identityKey,
    mediaType: row.mediaType,
    status: row.status,
    queuedAt: row.queuedAt ?? undefined,
    pirateClawDisposition:
      (row.pirateClawDisposition as PirateClawDisposition | null) ?? undefined,
    reconciledAt: row.reconciledAt ?? undefined,
    transmissionTorrentId: row.transmissionTorrentId ?? undefined,
    transmissionTorrentName: row.transmissionTorrentName ?? undefined,
    transmissionTorrentHash: row.transmissionTorrentHash ?? undefined,
    transmissionStatusCode: row.transmissionStatusCode ?? undefined,
    transmissionPercentDone: row.transmissionPercentDone ?? undefined,
    transmissionDoneDate: row.transmissionDoneDate ?? undefined,
    transmissionDownloadDir: row.transmissionDownloadDir ?? undefined,
    ruleName: row.ruleName,
    score: Number(row.score),
    reasons: JSON.parse(row.reasonsJson) as string[],
    rawTitle: row.rawTitle,
    normalizedTitle: row.normalizedTitle,
    season: row.season ?? undefined,
    episode: row.episode ?? undefined,
    year: row.year ?? undefined,
    resolution: row.resolution ?? undefined,
    codec: row.codec ?? undefined,
    feedName: row.feedName,
    guidOrLink: row.guidOrLink,
    publishedAt: row.publishedAt,
    downloadUrl: row.downloadUrl,
    firstSeenRunId: Number(row.firstSeenRunId),
    lastSeenRunId: Number(row.lastSeenRunId),
    lastFeedItemId: row.lastFeedItemId ?? undefined,
    updatedAt: row.updatedAt,
  };
}

function mapFeedItemOutcomeRow(row: FeedItemOutcomeRow): FeedItemOutcomeRecord {
  return {
    id: Number(row.id),
    runId: Number(row.runId),
    feedItemId: row.feedItemId ?? undefined,
    status: row.status,
    identityKey: row.identityKey ?? undefined,
    ruleName: row.ruleName ?? undefined,
    message: row.message ?? undefined,
    createdAt: row.createdAt,
  };
}

type RunRow = {
  id: number;
  startedAt: string;
  status: RunStatus;
  completedAt: string | null;
};

type FeedItemRow = {
  id: number;
  runId: number;
  feedName: string;
  guidOrLink: string;
  rawTitle: string;
  publishedAt: string;
  downloadUrl: string;
};

type RunSummaryRow = RunRow & {
  queuedCount: number;
  failedCount: number;
  skippedDuplicateCount: number;
  skippedNoMatchCount: number;
};

type CandidateStateRow = {
  identityKey: string;
  mediaType: NormalizedFeedItem['mediaType'];
  status: CandidateStatus;
  queuedAt: string | null;
  pirateClawDisposition: string | null;
  reconciledAt: string | null;
  transmissionTorrentId: number | null;
  transmissionTorrentName: string | null;
  transmissionTorrentHash: string | null;
  transmissionStatusCode: number | null;
  transmissionPercentDone: number | null;
  transmissionDoneDate: string | null;
  transmissionDownloadDir: string | null;
  ruleName: string;
  score: number;
  reasonsJson: string;
  rawTitle: string;
  normalizedTitle: string;
  season: number | null;
  episode: number | null;
  year: number | null;
  resolution: string | null;
  codec: NormalizedFeedItem['codec'] | null;
  feedName: string;
  guidOrLink: string;
  publishedAt: string;
  downloadUrl: string;
  firstSeenRunId: number;
  lastSeenRunId: number;
  lastFeedItemId: number | null;
  updatedAt: string;
};

type FeedItemOutcomeRow = {
  id: number;
  runId: number;
  feedItemId: number | null;
  status: FeedItemOutcomeStatus;
  identityKey: string | null;
  ruleName: string | null;
  message: string | null;
  createdAt: string;
};
