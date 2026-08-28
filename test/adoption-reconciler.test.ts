import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { discoverShowDirectories } from '../src/adoption/discover-media-dirs';
import { reconcileShowLibrary } from '../src/adoption/reconciler';
import { titlesMatch } from '../src/adoption/title-match';
import type { TransmissionConfig } from '../src/config';
import { ManualGrabsStore } from '../src/manual-grabs/store';
import { ensureSchema } from '../src/repository';
import type { TrackedShowRecord } from '../src/tracked-shows/store';

const servers: Array<ReturnType<typeof Bun.serve>> = [];
const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
  while (servers.length > 0) {
    servers.pop()?.stop(true);
  }
  globalThis.fetch = originalFetch;
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function trackedShow(
  overrides: Partial<TrackedShowRecord> = {},
): TrackedShowRecord {
  return {
    normalizedTitle: 'Dark Matter',
    displayTitle: 'Dark Matter',
    matchPattern: null,
    resolutions: [],
    codecs: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    lastReconciledAt: null,
    ...overrides,
  };
}

function startTransmissionServer(torrents: unknown[]): TransmissionConfig {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/transmission/rpc': () =>
        Response.json({ result: 'success', arguments: { torrents } }),
    },
  });
  servers.push(server);
  return {
    url: `${server.url.origin}/transmission/rpc`,
    username: 'pirate',
    password: 'claw',
  };
}

async function tempMediaDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pirate-claw-adoption-'));
  tempDirs.push(dir);
  return dir;
}

describe('titlesMatch', () => {
  it('matches on exact normalized title', () => {
    expect(titlesMatch('Dark Matter', 'Dark Matter')).toBe(true);
  });

  it('matches loosely on reordered/punctuation-differing words', () => {
    expect(titlesMatch('dark matter', 'Dark, Matter')).toBe(true);
  });

  it('matches a near-identical title differing by a small typo', () => {
    expect(titlesMatch('Severance', 'Sevrance')).toBe(true);
  });

  it('rejects an unrelated title', () => {
    expect(titlesMatch('Dark Matter', 'Completely Different Show')).toBe(false);
  });

  it('rejects a one-word qualifier suffix as a distinct show, not a variant', () => {
    // "The Office" (US) and "The Office UK" are genuinely different shows —
    // one-directional word containment must not be treated as a match here,
    // even though it legitimately could be for cosmetic-only matching (see
    // module doc comment in src/adoption/title-match.ts).
    expect(titlesMatch('The Office', 'The Office UK')).toBe(false);
  });
});

describe('discoverShowDirectories', () => {
  it('finds a "tv" dir nested somewhere other than the canonical media/shows path', async () => {
    const root = await tempMediaDir();
    await mkdir(join(root, 'downloads', 'complete', 'tv'), { recursive: true });
    await mkdir(join(root, 'media', 'shows'), { recursive: true });
    await mkdir(join(root, 'config'), { recursive: true });

    const found = await discoverShowDirectories(root);

    expect(found.sort()).toEqual(
      [
        join(root, 'downloads', 'complete', 'tv'),
        join(root, 'media', 'shows'),
      ].sort(),
    );
  });

  it('excludes "incomplete" — an in-progress download is not owned yet', async () => {
    const root = await tempMediaDir();
    await mkdir(join(root, 'downloads', 'incomplete', 'tv'), {
      recursive: true,
    });

    const found = await discoverShowDirectories(root);

    expect(found).toHaveLength(0);
  });

  it('does not recurse inside a matched "shows" directory looking for nested "tv"/"shows" dirs', async () => {
    const root = await tempMediaDir();
    // A show named "TV" would otherwise be a pathological nested match.
    await mkdir(join(root, 'shows', 'tv'), { recursive: true });

    const found = await discoverShowDirectories(root);

    expect(found).toEqual([join(root, 'shows')]);
  });

  it('returns an empty list when the root does not exist', async () => {
    const found = await discoverShowDirectories(
      '/nonexistent/pirate-claw-root',
    );
    expect(found).toEqual([]);
  });
});

describe('reconcileShowLibrary', () => {
  it('adopts a matching Transmission torrent pirate-claw did not queue', async () => {
    const transmission = startTransmissionServer([
      {
        id: 1,
        hashString: 'hash-1',
        name: 'Dark.Matter.S01E03.1080p.x265-GROUP',
      },
      {
        id: 2,
        hashString: 'hash-2',
        name: 'Unrelated.Show.S01E01.1080p.x265-GROUP',
      },
    ]);
    const database = new Database(':memory:');
    ensureSchema(database);
    const manualGrabs = new ManualGrabsStore(database);

    const result = await reconcileShowLibrary(trackedShow(), {
      transmission,
      manualGrabs,
      mediaShowsDirs: [],
    });

    expect(result.adoptedFromTransmission).toBe(1);
    const grabs = manualGrabs.listForShow('Dark Matter');
    expect(grabs).toHaveLength(1);
    expect(grabs[0]).toMatchObject({
      season: 1,
      episode: 3,
      source: 'adopted-transmission',
      transmissionTorrentHash: 'hash-1',
    });
  });

  it('does not re-adopt a torrent hash already known to manual_grabs', async () => {
    const transmission = startTransmissionServer([
      {
        id: 1,
        hashString: 'hash-1',
        name: 'Dark.Matter.S01E03.1080p.x265-GROUP',
      },
    ]);
    const database = new Database(':memory:');
    ensureSchema(database);
    const manualGrabs = new ManualGrabsStore(database);
    manualGrabs.record({
      normalizedTitle: 'Dark Matter',
      season: 1,
      episode: 3,
      source: 'eztv',
      rawTitle: 'already grabbed',
      transmissionTorrentHash: 'hash-1',
      transmissionTorrentId: 1,
    });

    const result = await reconcileShowLibrary(trackedShow(), {
      transmission,
      manualGrabs,
      mediaShowsDirs: [],
    });

    expect(result.adoptedFromTransmission).toBe(0);
    expect(manualGrabs.listForShow('Dark Matter')).toHaveLength(1);
  });

  it('adopts a matching video file on disk with no torrent behind it', async () => {
    const mediaDir = await tempMediaDir();
    await mkdir(join(mediaDir, 'Dark Matter', 'Season 01'), {
      recursive: true,
    });
    await writeFile(
      join(
        mediaDir,
        'Dark Matter',
        'Season 01',
        'Dark Matter - S01E05 - Title.mkv',
      ),
      '',
    );
    // Non-video files and unrelated shows must be ignored.
    await writeFile(
      join(
        mediaDir,
        'Dark Matter',
        'Season 01',
        'Dark Matter - S01E05 - Title.nfo',
      ),
      '',
    );
    await mkdir(join(mediaDir, 'Other Show'), { recursive: true });
    await writeFile(
      join(mediaDir, 'Other Show', 'Other Show - S01E01.mkv'),
      '',
    );

    const database = new Database(':memory:');
    ensureSchema(database);
    const manualGrabs = new ManualGrabsStore(database);

    const result = await reconcileShowLibrary(trackedShow(), {
      transmission: {
        url: 'http://127.0.0.1:1/rpc',
        username: '',
        password: '',
      },
      manualGrabs,
      mediaShowsDirs: [mediaDir],
    });

    expect(result.adoptedFromFilesystem).toBe(1);
    const grabs = manualGrabs.listForShow('Dark Matter');
    expect(grabs).toHaveLength(1);
    expect(grabs[0]).toMatchObject({
      season: 1,
      episode: 5,
      source: 'adopted-filesystem',
      transmissionTorrentHash: null,
    });
  });

  it('scans multiple media directories, e.g. media/shows plus a hand-added torrent under downloads/complete/tv', async () => {
    const mediaShowsDir = await tempMediaDir();
    const downloadsTvDir = await tempMediaDir();
    await writeFile(join(mediaShowsDir, 'Dark Matter - S01E05.mkv'), '');
    await writeFile(join(downloadsTvDir, 'Dark Matter - S01E06.mkv'), '');

    const database = new Database(':memory:');
    ensureSchema(database);
    const manualGrabs = new ManualGrabsStore(database);

    const result = await reconcileShowLibrary(trackedShow(), {
      transmission: {
        url: 'http://127.0.0.1:1/rpc',
        username: '',
        password: '',
      },
      manualGrabs,
      mediaShowsDirs: [mediaShowsDir, downloadsTvDir],
    });

    expect(result.adoptedFromFilesystem).toBe(2);
    const episodes = manualGrabs
      .listForShow('Dark Matter')
      .map((g) => g.episode)
      .sort();
    expect(episodes).toEqual([5, 6]);
  });

  it('is a no-op when nothing matches and never throws', async () => {
    const database = new Database(':memory:');
    ensureSchema(database);
    const manualGrabs = new ManualGrabsStore(database);

    const result = await reconcileShowLibrary(trackedShow(), {
      transmission: {
        url: 'http://127.0.0.1:1/rpc',
        username: '',
        password: '',
      },
      manualGrabs,
      mediaShowsDirs: [],
    });

    expect(result).toEqual({
      adoptedFromTransmission: 0,
      adoptedFromFilesystem: 0,
    });
  });
});
