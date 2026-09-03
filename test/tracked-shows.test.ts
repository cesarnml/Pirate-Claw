import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { ensureSchema } from '../src/repository';
import { TrackedShowsStore } from '../src/tracked-shows/store';
import {
  createPinnedTmdbIdResolver,
  normalizeShowName,
  syncTrackedShowsFromConfig,
} from '../src/tracked-shows/sync';
import type { AppConfig, TvRule } from '../src/config';

function freshDatabase(): Database {
  const database = new Database(':memory:');
  ensureSchema(database);
  return database;
}

describe('TrackedShowsStore', () => {
  it('createIfMissing creates a row, and is a no-op on repeat', () => {
    const store = new TrackedShowsStore(freshDatabase());
    const first = store.createIfMissing({
      normalizedTitle: 'dark matter',
      displayTitle: 'Dark Matter',
      resolutions: ['1080p'],
      codecs: ['x265'],
    });
    expect(first.displayTitle).toBe('Dark Matter');

    // A repeat call with different fields must not clobber the original —
    // e.g. a later config sync should never undo an earlier add-show.
    const second = store.createIfMissing({
      normalizedTitle: 'dark matter',
      displayTitle: 'Something Else',
      resolutions: ['720p'],
      codecs: ['x264'],
    });
    expect(second.displayTitle).toBe('Dark Matter');
    expect(store.list()).toHaveLength(1);
  });

  it('remove untracks a show', () => {
    const store = new TrackedShowsStore(freshDatabase());
    store.createIfMissing({
      normalizedTitle: 'silo',
      displayTitle: 'Silo',
      resolutions: [],
      codecs: [],
    });
    expect(store.remove('silo')).toBe(true);
    expect(store.get('silo')).toBeUndefined();
    expect(store.remove('silo')).toBe(false);
  });

  it('getByNormalizedTitleCaseInsensitive finds a show regardless of case', () => {
    const store = new TrackedShowsStore(freshDatabase());
    store.createIfMissing({
      normalizedTitle: 'Dark Matter',
      displayTitle: 'Dark Matter',
      resolutions: [],
      codecs: [],
    });
    expect(
      store.getByNormalizedTitleCaseInsensitive('dark matter')?.displayTitle,
    ).toBe('Dark Matter');
  });
});

describe('normalizeShowName', () => {
  it('matches the normalization candidate_state titles already use', () => {
    expect(normalizeShowName('Dark Matter')).toBe('Dark Matter');
    expect(normalizeShowName('The.Office.US')).toBe('The Office US');
  });
});

describe('syncTrackedShowsFromConfig', () => {
  it('creates a ledger row per configured show, carrying over matching fields', () => {
    const database = freshDatabase();
    const rules: TvRule[] = [
      {
        name: 'Silo',
        resolutions: ['2160p'],
        codecs: ['x265'],
        matchPattern: undefined,
      },
    ];
    syncTrackedShowsFromConfig(database, rules);

    const store = new TrackedShowsStore(database);
    const row = store.get('Silo');
    expect(row).toMatchObject({
      displayTitle: 'Silo',
      resolutions: ['2160p'],
      codecs: ['x265'],
    });
  });

  it('never overwrites an already-tracked show (idempotent on repeat sync)', () => {
    const database = freshDatabase();
    const store = new TrackedShowsStore(database);
    store.createIfMissing({
      normalizedTitle: 'Silo',
      displayTitle: 'Silo',
      resolutions: ['1080p'],
      codecs: ['x264'],
      addedAt: '2020-01-01T00:00:00.000Z',
    });

    syncTrackedShowsFromConfig(database, [
      { name: 'Silo', resolutions: ['2160p'], codecs: ['x265'] },
    ]);

    expect(store.get('Silo')).toMatchObject({
      resolutions: ['1080p'],
      codecs: ['x264'],
      addedAt: '2020-01-01T00:00:00.000Z',
    });
  });

  // Replaces two tests that asserted the opposite (a leftover
  // candidate-only title got a bare backfill row). That backfill was a
  // resurrection machine: untrack leaves candidate_state intact, so the row
  // came straight back on the next daemon restart — see the call site in
  // src/cli.ts. The watchlist is now the only thing that creates a row.
  it('creates rows only for watchlist entries, never for anything else', () => {
    const database = freshDatabase();
    const store = new TrackedShowsStore(database);
    // Stands in for a show the operator untracked whose candidate_state /
    // manual_grabs history still exists.
    syncTrackedShowsFromConfig(database, [
      { name: 'Silo', resolutions: ['2160p'], codecs: ['x265'] },
    ]);

    expect(store.list().map((row) => row.normalizedTitle)).toEqual(['Silo']);
  });

  it('does not resurrect an untracked show on a repeat sync', () => {
    const database = freshDatabase();
    const store = new TrackedShowsStore(database);
    const rules: TvRule[] = [
      { name: 'Silo', resolutions: [], codecs: [] },
      { name: 'Tomb Raider', resolutions: [], codecs: [] },
    ];
    syncTrackedShowsFromConfig(database, rules);
    expect(store.list()).toHaveLength(2);

    // Untrack drops the ledger row and the watchlist entry together (what
    // DELETE /api/shows/:slug does). A later sync — daemon restart, or any
    // other config write — must not bring it back.
    store.remove('Tomb Raider');
    syncTrackedShowsFromConfig(database, [rules[0]!]);

    expect(store.list().map((row) => row.normalizedTitle)).toEqual(['Silo']);
  });
});

describe('createPinnedTmdbIdResolver', () => {
  function holder(tv: TvRule[]): { current: AppConfig } {
    return { current: { tv } as AppConfig };
  }

  it('resolves a pinned show case-insensitively and leaves others unpinned', () => {
    const resolver = createPinnedTmdbIdResolver(
      holder([
        { name: 'Tomb Raider', tmdbId: 42, resolutions: [], codecs: [] },
        { name: 'Silo', resolutions: [], codecs: [] },
      ]),
    );

    // A show's normalized title can carry a feed item's raw casing rather
    // than config's, so the lookup has to fold case the way tvMatchKey does.
    expect(resolver('tomb raider')).toBe(42);
    expect(resolver('TOMB RAIDER')).toBe(42);
    expect(resolver('silo')).toBeUndefined();
    expect(resolver('never tracked')).toBeUndefined();
  });

  // The resolver is built once at daemon startup but the daemon replaces
  // configHolder.current on every config write. Reading through the holder is
  // what makes a pin take effect immediately instead of at the next restart —
  // which would be the whole feature not working.
  it('picks up a pin added after it was created', () => {
    const configHolder = holder([
      { name: 'Tomb Raider', resolutions: [], codecs: [] },
    ]);
    const resolver = createPinnedTmdbIdResolver(configHolder);
    expect(resolver('tomb raider')).toBeUndefined();

    configHolder.current = holder([
      { name: 'Tomb Raider', tmdbId: 42, resolutions: [], codecs: [] },
    ]).current;

    expect(resolver('tomb raider')).toBe(42);
  });
});
