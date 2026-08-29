import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import {
  ensurePlexMovieSyncStateSchema,
  PlexMovieSyncStateStore,
} from '../src/plex/movie-sync-state';

function freshStore(): PlexMovieSyncStateStore {
  const database = new Database(':memory:');
  ensurePlexMovieSyncStateSchema(database);
  return new PlexMovieSyncStateStore(database);
}

describe('PlexMovieSyncStateStore', () => {
  it('reports never-synced/not-bootstrapped before anything happens', () => {
    const store = freshStore();
    expect(store.get()).toEqual({ lastSyncedAt: null, bootstrapDone: false });
  });

  it('claimBootstrap wins exactly once — a second claim is refused', () => {
    const store = freshStore();
    expect(store.claimBootstrap()).toBe(true);
    expect(store.claimBootstrap()).toBe(false);
    expect(store.get().bootstrapDone).toBe(true);
    expect(store.get().lastSyncedAt).toBeNull();
  });

  it('recordSync sets both lastSyncedAt and bootstrapDone, even without a prior claim', () => {
    const store = freshStore();
    store.recordSync('2026-08-29T00:00:00.000Z');
    expect(store.get()).toEqual({
      lastSyncedAt: '2026-08-29T00:00:00.000Z',
      bootstrapDone: true,
    });
    // A manual sync already covers the bootstrap case — no reason to also
    // auto-trigger one later.
    expect(store.claimBootstrap()).toBe(false);
  });

  it('recordSync overwrites the timestamp on a later manual sync', () => {
    const store = freshStore();
    store.recordSync('2026-08-01T00:00:00.000Z');
    store.recordSync('2026-08-29T00:00:00.000Z');
    expect(store.get().lastSyncedAt).toBe('2026-08-29T00:00:00.000Z');
  });
});
