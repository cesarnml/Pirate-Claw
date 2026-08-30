import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { ManualMovieGrabsStore } from '../src/manual-movie-grabs/store';
import { ensureSchema } from '../src/repository';

function freshStore(): ManualMovieGrabsStore {
  const database = new Database(':memory:');
  ensureSchema(database);
  return new ManualMovieGrabsStore(database);
}

describe('ManualMovieGrabsStore', () => {
  it('records a manual movie grab and lists it back by tmdbId', () => {
    const store = freshStore();
    const recorded = store.record({
      tmdbId: 969681,
      imdbId: 'tt22084616',
      source: 'yts',
      rawTitle: 'Spider-Man Brand New Day (2026) [1080p] [YTS.GG]',
      transmissionTorrentHash: 'abc123',
      transmissionTorrentId: 42,
      moviePosterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      movieDisplayTitle: 'Spider-Man: Brand New Day',
    });

    expect(recorded.id).toBeGreaterThan(0);

    const rows = store.listForMovie(969681);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tmdbId: 969681,
      imdbId: 'tt22084616',
      source: 'yts',
      transmissionTorrentHash: 'abc123',
    });
  });

  it('keeps grabs scoped to the movie they were recorded under', () => {
    const store = freshStore();
    store.record({
      tmdbId: 1,
      imdbId: null,
      source: 'thepiratebay',
      rawTitle: 'Movie A',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });
    store.record({
      tmdbId: 2,
      imdbId: null,
      source: 'yts',
      rawTitle: 'Movie B',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });

    expect(store.listForMovie(1)).toHaveLength(1);
    expect(store.listForMovie(2)).toHaveLength(1);
    expect(store.listForMovie(3)).toHaveLength(0);
  });

  it('listGrabbedTmdbIds returns every distinct tmdbId with at least one grab', () => {
    const store = freshStore();
    store.record({
      tmdbId: 1,
      imdbId: null,
      source: 'yts',
      rawTitle: 'Movie A v1',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });
    store.record({
      tmdbId: 1,
      imdbId: null,
      source: 'yts',
      rawTitle: 'Movie A v2 (regrabbed)',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });
    store.record({
      tmdbId: 2,
      imdbId: null,
      source: 'thepiratebay',
      rawTitle: 'Movie B',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });

    expect(store.listGrabbedTmdbIds()).toEqual(new Set([1, 2]));
  });

  it('hasTorrentHash and listAllTorrentDisplayInfo only see hashed grabs, most recent wins on repeat', () => {
    const store = freshStore();
    store.record({
      tmdbId: 1,
      imdbId: null,
      source: 'yts',
      rawTitle: 'first grab, no hash yet',
      transmissionTorrentHash: null,
      transmissionTorrentId: null,
    });
    expect(store.hasTorrentHash('deadbeef')).toBe(false);

    store.record({
      tmdbId: 1,
      imdbId: null,
      source: 'yts',
      rawTitle: 'old title',
      transmissionTorrentHash: 'deadbeef',
      transmissionTorrentId: 1,
      moviePosterUrl: 'old-poster.jpg',
      movieDisplayTitle: 'Old Title',
      queuedAt: '2026-01-01T00:00:00.000Z',
    });
    store.record({
      tmdbId: 1,
      imdbId: null,
      source: 'yts',
      rawTitle: 'new title',
      transmissionTorrentHash: 'deadbeef',
      transmissionTorrentId: 2,
      moviePosterUrl: 'new-poster.jpg',
      movieDisplayTitle: 'New Title',
      queuedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(store.hasTorrentHash('deadbeef')).toBe(true);
    expect(store.listAllTorrentHashes()).toEqual(['deadbeef']);
    expect(store.listAllTorrentDisplayInfo().get('deadbeef')).toEqual({
      posterUrl: 'new-poster.jpg',
      displayTitle: 'New Title',
    });
  });

  describe('markDone / listCompleted', () => {
    it('records a completion once and keeps the first timestamp on repeat calls', () => {
      const store = freshStore();
      store.record({
        tmdbId: 1,
        imdbId: null,
        source: 'yts',
        rawTitle: 'Movie A',
        transmissionTorrentHash: 'hash-1',
        transmissionTorrentId: 1,
        moviePosterUrl: 'https://example.test/poster.jpg',
        movieDisplayTitle: 'Movie A',
      });

      store.markDone('hash-1', '2026-02-01T00:00:00.000Z');
      store.markDone('hash-1', '2026-03-01T00:00:00.000Z');

      expect(store.listCompleted().get('hash-1')).toEqual({
        posterUrl: 'https://example.test/poster.jpg',
        displayTitle: 'Movie A',
        doneAt: '2026-02-01T00:00:00.000Z',
      });
    });

    it('omits grabs with no recorded completion', () => {
      const store = freshStore();
      store.record({
        tmdbId: 1,
        imdbId: null,
        source: 'yts',
        rawTitle: 'Movie A',
        transmissionTorrentHash: 'hash-1',
        transmissionTorrentId: 1,
      });

      expect(store.listCompleted().size).toBe(0);
    });
  });
});
