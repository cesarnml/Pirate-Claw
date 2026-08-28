import type { Database } from 'bun:sqlite';

export type ManualGrabSource = 'eztv';

export type ManualGrabRecord = {
  id: number;
  normalizedTitle: string;
  season: number;
  episode: number;
  source: ManualGrabSource;
  rawTitle: string;
  transmissionTorrentHash: string | null;
  transmissionTorrentId: number | null;
  queuedAt: string;
};

export type RecordManualGrabInput = {
  normalizedTitle: string;
  season: number;
  episode: number;
  source: ManualGrabSource;
  rawTitle: string;
  transmissionTorrentHash: string | null;
  transmissionTorrentId: number | null;
  queuedAt?: string;
};

type ManualGrabRow = {
  id: number;
  normalized_title: string;
  season: number;
  episode: number;
  source: string;
  raw_title: string;
  transmission_torrent_hash: string | null;
  transmission_torrent_id: number | null;
  queued_at: string;
};

function rowToRecord(row: ManualGrabRow): ManualGrabRecord {
  return {
    id: row.id,
    normalizedTitle: row.normalized_title,
    season: row.season,
    episode: row.episode,
    source: row.source as ManualGrabSource,
    rawTitle: row.raw_title,
    transmissionTorrentHash: row.transmission_torrent_hash,
    transmissionTorrentId: row.transmission_torrent_id,
    queuedAt: row.queued_at,
  };
}

export class ManualGrabsStore {
  constructor(private readonly database: Database) {}

  record(input: RecordManualGrabInput): ManualGrabRecord {
    const queuedAt = input.queuedAt ?? new Date().toISOString();
    const result = this.database
      .query(
        `INSERT INTO manual_grabs (
          normalized_title,
          season,
          episode,
          source,
          raw_title,
          transmission_torrent_hash,
          transmission_torrent_id,
          queued_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .run(
        input.normalizedTitle,
        input.season,
        input.episode,
        input.source,
        input.rawTitle,
        input.transmissionTorrentHash,
        input.transmissionTorrentId,
        queuedAt,
      );

    return {
      id: Number(result.lastInsertRowid),
      normalizedTitle: input.normalizedTitle,
      season: input.season,
      episode: input.episode,
      source: input.source,
      rawTitle: input.rawTitle,
      transmissionTorrentHash: input.transmissionTorrentHash,
      transmissionTorrentId: input.transmissionTorrentId,
      queuedAt,
    };
  }

  /** All manual grabs recorded for a show, most recent first — one episode
   * can have more than one row if it was grabbed more than once. */
  listForShow(normalizedTitle: string): ManualGrabRecord[] {
    const rows = this.database
      .query(
        `SELECT id, normalized_title, season, episode, source, raw_title,
                transmission_torrent_hash, transmission_torrent_id, queued_at
         FROM manual_grabs
         WHERE normalized_title = ?1
         ORDER BY queued_at DESC`,
      )
      .all(normalizedTitle) as ManualGrabRow[];
    return rows.map(rowToRecord);
  }
}
