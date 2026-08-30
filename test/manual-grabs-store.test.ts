import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { ManualGrabsStore } from '../src/manual-grabs/store';
import { ensureSchema } from '../src/repository';

function freshStore(): ManualGrabsStore {
  const database = new Database(':memory:');
  ensureSchema(database);
  return new ManualGrabsStore(database);
}

describe('ManualGrabsStore', () => {
  it('records a manual grab and lists it back for its show', () => {
    const store = freshStore();
    const recorded = store.record({
      normalizedTitle: 'strange new worlds',
      season: 4,
      episode: 6,
      source: 'eztv',
      rawTitle: 'Star Trek Strange New Worlds S04E06 1080p HEVC x265-MeGusta',
      transmissionTorrentHash: 'abc123',
      transmissionTorrentId: 42,
    });

    expect(recorded.id).toBeGreaterThan(0);

    const rows = store.listForShow('strange new worlds');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      season: 4,
      episode: 6,
      source: 'eztv',
      transmissionTorrentHash: 'abc123',
    });
  });

  it('keeps grabs scoped to the show they were recorded under', () => {
    const store = freshStore();
    store.record({
      normalizedTitle: 'show a',
      season: 1,
      episode: 1,
      source: 'eztv',
      rawTitle: 'Show A S01E01',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });
    store.record({
      normalizedTitle: 'show b',
      season: 1,
      episode: 1,
      source: 'eztv',
      rawTitle: 'Show B S01E01',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });

    expect(store.listForShow('show a')).toHaveLength(1);
    expect(store.listForShow('show b')).toHaveLength(1);
    expect(store.listForShow('show c')).toHaveLength(0);
  });

  it('orders repeated grabs of the same episode most-recent first', () => {
    const store = freshStore();
    store.record({
      normalizedTitle: 'show a',
      season: 1,
      episode: 1,
      source: 'eztv',
      rawTitle: 'first attempt',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
      queuedAt: '2026-01-01T00:00:00.000Z',
    });
    store.record({
      normalizedTitle: 'show a',
      season: 1,
      episode: 1,
      source: 'eztv',
      rawTitle: 'second attempt',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
      queuedAt: '2026-01-02T00:00:00.000Z',
    });

    const rows = store.listForShow('show a');
    expect(rows.map((r) => r.rawTitle)).toEqual([
      'second attempt',
      'first attempt',
    ]);
  });

  it('listAllTorrentDisplayInfo maps hash to poster/title, most-recent grab winning on a repeat', () => {
    const store = freshStore();
    store.record({
      normalizedTitle: 'show a',
      season: 1,
      episode: 1,
      source: 'eztv',
      rawTitle: 'first attempt',
      transmissionTorrentHash: 'hash-1',
      transmissionTorrentId: 1,
      showPosterUrl: 'https://example.test/old-poster.jpg',
      showDisplayTitle: 'Show A',
      queuedAt: '2026-01-01T00:00:00.000Z',
    });
    // Same hash grabbed again later with different display info — the
    // later grab should win.
    store.record({
      normalizedTitle: 'show a',
      season: 1,
      episode: 1,
      source: 'eztv',
      rawTitle: 'second attempt',
      transmissionTorrentHash: 'hash-1',
      transmissionTorrentId: 1,
      showPosterUrl: 'https://example.test/new-poster.jpg',
      showDisplayTitle: 'Show A (renamed)',
      queuedAt: '2026-01-02T00:00:00.000Z',
    });
    store.record({
      normalizedTitle: 'show b',
      season: 1,
      episode: 1,
      source: 'eztv',
      rawTitle: 'no hash yet',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });

    const info = store.listAllTorrentDisplayInfo();
    expect(Array.from(info.keys())).toEqual(['hash-1']);
    expect(info.get('hash-1')).toEqual({
      posterUrl: 'https://example.test/new-poster.jpg',
      displayTitle: 'Show A (renamed)',
      normalizedTitle: 'show a',
      season: 1,
      episode: 1,
    });
  });
});
