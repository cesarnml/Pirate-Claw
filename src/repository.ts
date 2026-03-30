import { Database } from 'bun:sqlite';

import type { RawFeedItem } from './feed';
import type { NormalizedFeedItem } from './normalize';

export type CandidateStatus = 'queued' | 'failed' | 'skipped_duplicate';
export type RunStatus = 'running' | 'completed' | 'failed';

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
};

export type RecordCandidateOutcomeInput = {
  runId: number;
  feedItemId?: number;
  feedItem: RawFeedItem;
  match: CandidateMatchRecord;
  status: CandidateStatus;
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
  recordFeedItemOutcome(
    input: RecordFeedItemOutcomeInput,
  ): FeedItemOutcomeRecord;
  listFeedItemOutcomes(runId: number): FeedItemOutcomeRecord[];
  listRecentRunSummaries(limit?: number): RunSummaryRecord[];
  listCandidateStates(limit?: number): CandidateStateRecord[];
  listRetryableCandidates(limit?: number): CandidateStateRecord[];
};

export const DEFAULT_DATABASE_PATH = 'media-sync.db';

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
      updated_at
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
      ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22
    )
    ON CONFLICT(identity_key) DO UPDATE SET
      media_type = excluded.media_type,
      status = excluded.status,
      queued_at = COALESCE(candidate_state.queued_at, excluded.queued_at),
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
  const listRetryableCandidatesStatement = database.query(
    `SELECT
      identity_key AS identityKey,
      media_type AS mediaType,
      status,
      queued_at AS queuedAt,
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

    listRetryableCandidates(limit = 1000): CandidateStateRecord[] {
      return (
        listRetryableCandidatesStatement.all(limit) as CandidateStateRow[]
      ).map(mapCandidateStateRow);
    },
  };
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
