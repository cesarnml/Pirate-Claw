import type { Database } from 'bun:sqlite';
import type { PirateClawDisposition } from '../repository';

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
  /** null until Torrent Manager (or this feature's own stalled-torrent
   * remove button) records this row as removed/deleted — see
   * setDisposition. Surfaced here (unlike most other read paths on this
   * store) because episode-status.ts needs it to stop showing "Queued" for
   * a grab that was pulled before it ever completed. */
  disposition: PirateClawDisposition | null;
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
  /** Declared/parsed quality and swarm-health signal captured at grab time —
   * purely for future analysis (deriving an auto-grab heuristic from real
   * outcomes), never read back by any code path yet. All optional/nullable:
   * a source that doesn't reliably report one is still worth recording
   * partially rather than dropping the whole grab's metadata. */
  resolution?: string | null;
  codec?: string | null;
  sizeBytes?: number | null;
  seeds?: number | null;
  peers?: number | null;
};

/** Poster/title info for one manually-grabbed, still-hash-identified
 * torrent — the dashboard-display equivalent of what candidatePosterUrl /
 * candidateTitle derive from a candidate_state row. season/episode/
 * normalizedTitle ride along too: same rationale as posterUrl/displayTitle
 * above, powering the S/E pill and the /shows/:slug link on the dashboard
 * (Torrent Manager, Your Haul) for a torrent with no candidate_state row to
 * source those from. */
export type ManualGrabDisplayInfo = {
  posterUrl: string | null;
  displayTitle: string | null;
  normalizedTitle: string;
  season: number;
  episode: number;
  /** Rides along so /api/transmission/torrents can tell the dashboard how
   * this torrent got here (search grab vs. adopted-from-Transmission vs.
   * adopted-from-filesystem) — see the origin icon on Torrent Manager
   * cards. */
  source: ManualGrabSource;
  /** null until Torrent Manager (or the missing-torrent reconciler) records
   * this row as removed/deleted — see setDisposition. */
  disposition: PirateClawDisposition | null;
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
  disposition: string | null;
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
    disposition: row.disposition as PirateClawDisposition | null,
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
          show_display_title,
          resolution,
          codec,
          size_bytes,
          seeds,
          peers
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
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
        input.resolution ?? null,
        input.codec ?? null,
        input.sizeBytes ?? null,
        input.seeds ?? null,
        input.peers ?? null,
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
      disposition: null,
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

  /** Whether this hash has a manual grab row that ISN'T already in a
   * terminal disposition — used by resolveManagedTorrentAction (api.ts) to
   * reject pause/resume/remove/dispose on a hash already marked removed/
   * deleted, the manual-grab-shaped mirror of the candidate_state terminal-
   * disposition check just above it. A hash grabbed more than once
   * (multiple rows) counts as active if any row is still undisposed. */
  hasActiveTorrentHash(hash: string): boolean {
    const row = this.database
      .query(
        `SELECT 1 FROM manual_grabs
         WHERE transmission_torrent_hash = ?1 AND disposition IS NULL
         LIMIT 1`,
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
                show_display_title AS displayTitle,
                normalized_title AS normalizedTitle,
                season,
                episode,
                source,
                disposition
         FROM manual_grabs
         WHERE transmission_torrent_hash IS NOT NULL
         ORDER BY queued_at ASC`,
      )
      .all() as {
      hash: string;
      posterUrl: string | null;
      displayTitle: string | null;
      normalizedTitle: string;
      season: number;
      episode: number;
      source: string;
      disposition: string | null;
    }[];

    const map = new Map<string, ManualGrabDisplayInfo>();
    // ASC order + overwrite-on-repeat means the last write per hash (the
    // most recent grab) wins.
    for (const row of rows) {
      map.set(row.hash, {
        posterUrl: row.posterUrl,
        displayTitle: row.displayTitle,
        normalizedTitle: row.normalizedTitle,
        season: row.season,
        episode: row.episode,
        source: row.source as ManualGrabSource,
        disposition: row.disposition as PirateClawDisposition | null,
      });
    }
    return map;
  }

  /** Marks a manually-grabbed torrent removed/deleted — the manual-grab
   * sibling of Repository.setPirateClawDisposition. Called synchronously
   * from the Torrent Manager remove/remove-and-delete/dispose handlers
   * (api.ts), same as candidate_state's disposition. Only the first
   * disposition sticks (WHERE disposition IS NULL): a hash already marked
   * terminal shouldn't flip states again. */
  setDisposition(hash: string, disposition: PirateClawDisposition): void {
    this.database
      .query(
        `UPDATE manual_grabs SET disposition = ?2
         WHERE transmission_torrent_hash = ?1 AND disposition IS NULL`,
      )
      .run(hash, disposition);
  }

  /** Records the first observed completion for a manually-grabbed torrent —
   * called from /api/transmission/torrents whenever it sees this hash at
   * 100% done. Idempotent: only rows still NULL are touched, so the first
   * completion timestamp sticks even if this fires again later (e.g. after
   * a re-seed cycle resets Transmission's own doneDate). See done_at's
   * schema comment for why this can't just be read live from Transmission. */
  markDone(hash: string, doneAt: string): void {
    this.database
      .query(
        `UPDATE manual_grabs SET done_at = ?2
         WHERE transmission_torrent_hash = ?1 AND done_at IS NULL`,
      )
      .run(hash, doneAt);
  }

  /** Every manually-grabbed torrent with a recorded completion, keyed by
   * hash — the manual-grab-sourced half of Your Haul (see
   * +page.svelte:manualGrabArchiveItems). Survives the torrent itself being
   * removed from Transmission, unlike listAllTorrentDisplayInfo's live-join
   * fields. When a hash has more than one grab, the most recently queued
   * one's display info wins, same as listAllTorrentDisplayInfo. */
  listCompleted(): Map<
    string,
    Pick<
      ManualGrabDisplayInfo,
      'posterUrl' | 'displayTitle' | 'normalizedTitle' | 'season' | 'episode'
    > & { doneAt: string }
  > {
    const rows = this.database
      .query(
        `SELECT transmission_torrent_hash AS hash,
                show_poster_url AS posterUrl,
                show_display_title AS displayTitle,
                normalized_title AS normalizedTitle,
                season,
                episode,
                done_at AS doneAt
         FROM manual_grabs
         WHERE done_at IS NOT NULL
         ORDER BY queued_at ASC`,
      )
      .all() as {
      hash: string;
      posterUrl: string | null;
      displayTitle: string | null;
      normalizedTitle: string;
      season: number;
      episode: number;
      doneAt: string;
    }[];

    const map = new Map<
      string,
      Pick<
        ManualGrabDisplayInfo,
        'posterUrl' | 'displayTitle' | 'normalizedTitle' | 'season' | 'episode'
      > & { doneAt: string }
    >();
    for (const row of rows) {
      map.set(row.hash, {
        posterUrl: row.posterUrl,
        displayTitle: row.displayTitle,
        normalizedTitle: row.normalizedTitle,
        season: row.season,
        episode: row.episode,
        doneAt: row.doneAt,
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
                transmission_torrent_hash, transmission_torrent_id, queued_at,
                disposition
         FROM manual_grabs
         WHERE normalized_title = ?1
         ORDER BY queued_at DESC`,
      )
      .all(normalizedTitle) as ManualGrabRow[];
    return rows.map(rowToRecord);
  }
}
