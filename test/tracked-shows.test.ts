import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { ensureSchema } from '../src/repository';
import { TrackedShowsStore } from '../src/tracked-shows/store';
import {
  normalizeShowName,
  syncTrackedShowsFromConfig,
} from '../src/tracked-shows/sync';
import type { TvRule } from '../src/config';

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

  it('backfills a bare row for a leftover candidate-only title not in config', () => {
    const database = freshDatabase();
    syncTrackedShowsFromConfig(database, [], ['legacy show']);

    const store = new TrackedShowsStore(database);
    expect(store.get('legacy show')).toMatchObject({
      displayTitle: 'legacy show',
      resolutions: [],
      codecs: [],
    });
  });

  it('does not double-create a leftover title already covered by config', () => {
    const database = freshDatabase();
    syncTrackedShowsFromConfig(
      database,
      [{ name: 'Silo', resolutions: ['2160p'], codecs: ['x265'] }],
      ['Silo'],
    );

    expect(new TrackedShowsStore(database).list()).toHaveLength(1);
  });
});
