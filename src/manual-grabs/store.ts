import type { Database } from 'bun:sqlite';

export type ManualGrabSource =
  | 'eztv'
  | 'thepiratebay'
  /** Discovered as a Transmission torrent pirate-claw didn't queue itself
   * (hand-added via Transmission's own web UI) and matched to a tracked show
   * by the library reconciler. See src/adoption/reconciler.ts. */
  | 'adopted-transmission'
  /** Discovered as a file on disk with no Transmission torrent behind it at
   * all (manually copied in, or predates pirate-claw) and matched to a
   * tracked show by the library reconciler. */
  | 'adopted-filesystem';

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
  /** The show's own TMDB poster/name, if known at grab time — stored so the
   * dashboard can show real cover art instead of a letter avatar for a
   * torrent that has no candidate_state row to look that up from. */
  showPosterUrl?: string | null;
  showDisplayTitle?: string | null;
  queuedAt?: string;
};

/** Poster/title info for one manually-grabbed, still-hash-identified
 * torrent — the dashboard-display equivalent of what candidatePosterUrl /
 * candidateTitle derive from a candidate_state row. */
export type ManualGrabDisplayInfo = {
  posterUrl: string | null;
  displayTitle: string | null;
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
          queued_at,
          show_poster_url,
          show_display_title
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
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
        input.showPosterUrl ?? null,
        input.showDisplayTitle ?? null,
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

  /** Every distinct Transmission torrent hash any manual grab has ever
   * recorded, across all shows — used so /api/transmission/torrents can
   * surface manually-grabbed torrents too, not just candidate_state ones. */
  listAllTorrentHashes(): string[] {
    return Array.from(this.listAllTorrentDisplayInfo().keys());
  }

  /** Whether any manual grab ever recorded this Transmission torrent hash —
   * used so pause/resume/remove/remove-and-delete can manage a manually-
   * grabbed torrent too, not just candidate_state ones (see
   * resolveManagedTorrentAction in api.ts). */
  hasTorrentHash(hash: string): boolean {
    const row = this.database
      .query(
        `SELECT 1 FROM manual_grabs WHERE transmission_torrent_hash = ?1 LIMIT 1`,
      )
      .get(hash);
    return row !== null;
  }

  /** Poster/title info for every manually-grabbed torrent that still has a
   * hash, keyed by hash — lets /api/transmission/torrents show real cover
   * art for these instead of falling back to a letter avatar (they have no
   * candidate_state row for the usual poster lookup to find). When a hash
   * was grabbed more than once, the most recent grab's info wins. */
  listAllTorrentDisplayInfo(): Map<string, ManualGrabDisplayInfo> {
    const rows = this.database
      .query(
        `SELECT transmission_torrent_hash AS hash,
                show_poster_url AS posterUrl,
                show_display_title AS displayTitle
         FROM manual_grabs
         WHERE transmission_torrent_hash IS NOT NULL
         ORDER BY queued_at ASC`,
      )
      .all() as {
      hash: string;
      posterUrl: string | null;
      displayTitle: string | null;
    }[];

    const map = new Map<string, ManualGrabDisplayInfo>();
    // ASC order + overwrite-on-repeat means the last write per hash (the
    // most recent grab) wins.
    for (const row of rows) {
      map.set(row.hash, {
        posterUrl: row.posterUrl,
        displayTitle: row.displayTitle,
      });
    }
    return map;
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
