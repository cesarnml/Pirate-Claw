import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureStarterConfig, getSetupState } from '../src/bootstrap';
import { validateConfig } from '../src/config';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pirate-claw-bootstrap-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('ensureStarterConfig', () => {
  it('writes a starter config when the file does not exist', async () => {
    const path = join(dir, 'pirate-claw.config.json');

    await ensureStarterConfig(path);

    const written = await Bun.file(path).json();
    expect(written._starter).toBe(true);
    expect(written.transmission.url).toBe(
      'http://localhost:9091/transmission/rpc',
    );
    expect(written.plex.url).toBe('http://localhost:32400');
    expect(written.plex.token).toBe('');
    expect(Array.isArray(written.feeds)).toBe(true);
    expect(written.feeds.length).toBe(0);
    expect(Array.isArray(written.tv.shows)).toBe(true);
    expect(written.tv.shows.length).toBe(0);

    expect(written.movies).toBeUndefined();
  });

  it('does nothing when the file already exists', async () => {
    const path = join(dir, 'pirate-claw.config.json');
    const original = JSON.stringify({ existing: true });
    await Bun.write(path, original);

    await ensureStarterConfig(path);

    const content = await Bun.file(path).text();
    expect(content).toBe(original);
  });

  it('written config passes validateConfig without modification', async () => {
    const path = join(dir, 'pirate-claw.config.json');
    await ensureStarterConfig(path);

    const written = await Bun.file(path).json();
    const env: Record<string, string | undefined> = {};

    expect(() => validateConfig(written, path, env)).not.toThrow();
  });

  it('empty compact tv shows array is valid', () => {
    const config = {
      transmission: {
        url: 'http://localhost:9091/transmission/rpc',
        username: 'admin',
        password: 'admin',
      },
      plex: { url: 'http://localhost:32400', token: '' },
      tv: { defaults: { resolutions: ['1080p'], codecs: ['x264'] }, shows: [] },
      feeds: [],
    };

    expect(() => validateConfig(config, 'test', {})).not.toThrow();
  });
});
const FIXTURE_DIR = join(import.meta.dir, 'fixtures/setup-state');

describe('getSetupState', () => {
  it('returns "starter" when file does not exist', async () => {
    const path = join(dir, 'missing.json');
    expect(await getSetupState(path)).toBe('starter');
  });

  it('returns "starter" for starter fixture (_starter: true)', async () => {
    const path = join(dir, 'starter.json');
    await copyFile(join(FIXTURE_DIR, 'starter.json'), path);
    expect(await getSetupState(path)).toBe('starter');
  });

  it('returns "partially_configured" for partially-configured fixture', async () => {
    const path = join(dir, 'partial.json');
    await copyFile(join(FIXTURE_DIR, 'partially-configured.json'), path);
    expect(await getSetupState(path)).toBe('partially_configured');
  });

  it('returns "ready" for ready fixture', async () => {
    const path = join(dir, 'ready.json');
    await copyFile(join(FIXTURE_DIR, 'ready.json'), path);
    expect(await getSetupState(path)).toBe('ready');
  });

  it('returns "partially_configured" when _starter absent but feeds empty', async () => {
    const path = join(dir, 'no-feeds.json');
    await Bun.write(
      path,
      JSON.stringify({
        transmission: { url: 'http://mybox:9091/transmission/rpc' },
        tv: {
          defaults: { resolutions: ['1080p'], codecs: ['x264'] },
          shows: ['Breaking Bad'],
        },
        feeds: [],
      }),
    );
    expect(await getSetupState(path)).toBe('partially_configured');
  });

  it('returns "partially_configured" when tv is empty', async () => {
    const path = join(dir, 'no-tv.json');
    await Bun.write(
      path,
      JSON.stringify({
        transmission: { url: 'http://mybox:9091/transmission/rpc' },
        tv: {
          defaults: { resolutions: ['1080p'], codecs: ['x264'] },
          shows: [],
        },
        feeds: [
          { name: 'rss', url: 'https://example.com/rss', mediaType: 'tv' },
        ],
      }),
    );
    expect(await getSetupState(path)).toBe('partially_configured');
  });

  it('returns "partially_configured" for invalid JSON', async () => {
    const path = join(dir, 'bad.json');
    await Bun.write(path, 'not json');
    expect(await getSetupState(path)).toBe('partially_configured');
  });

  it('returns "ready" for TV-only feeds with tv.shows non-empty and any transmission URL', async () => {
    const path = join(dir, 'tv-only-ready.json');
    await Bun.write(
      path,
      JSON.stringify({
        transmission: { url: 'http://mybox:9091/transmission/rpc' },
        tv: {
          defaults: { resolutions: ['1080p'], codecs: ['x264'] },
          shows: ['Breaking Bad'],
        },
        feeds: [
          { name: 'rss', url: 'https://example.com/rss', mediaType: 'tv' },
        ],
      }),
    );
    expect(await getSetupState(path)).toBe('ready');
  });

  it('returns "ready" for movie-only feeds with movies present and any transmission URL', async () => {
    const path = join(dir, 'movie-only-ready.json');
    await Bun.write(
      path,
      JSON.stringify({
        transmission: { url: 'http://mybox:9091/transmission/rpc' },
        movies: {
          years: [2024],
          resolutions: ['1080p'],
          codecs: ['x264'],
          codecPolicy: 'prefer',
        },
        feeds: [
          { name: 'rss', url: 'https://example.com/rss', mediaType: 'movie' },
        ],
      }),
    );
    expect(await getSetupState(path)).toBe('ready');
  });

  it('returns "ready" for mixed feeds with both targets configured', async () => {
    const path = join(dir, 'mixed-ready.json');
    await Bun.write(
      path,
      JSON.stringify({
        transmission: { url: 'http://mybox:9091/transmission/rpc' },
        movies: {
          years: [2024],
          resolutions: ['1080p'],
          codecs: ['x264'],
          codecPolicy: 'prefer',
        },
        tv: {
          defaults: { resolutions: ['1080p'], codecs: ['x264'] },
          shows: ['Breaking Bad'],
        },
        feeds: [
          { name: 'tv', url: 'https://example.com/tv', mediaType: 'tv' },
          {
            name: 'movies',
            url: 'https://example.com/movies',
            mediaType: 'movie',
          },
        ],
      }),
    );
    expect(await getSetupState(path)).toBe('ready');
  });

  it('returns "ready" for bundled deployment at default transmission URL', async () => {
    const path = join(dir, 'default-url-ready.json');
    await Bun.write(
      path,
      JSON.stringify({
        transmission: { url: 'http://localhost:9091/transmission/rpc' },
        tv: {
          defaults: { resolutions: ['1080p'], codecs: ['x264'] },
          shows: ['Breaking Bad'],
        },
        feeds: [
          { name: 'rss', url: 'https://example.com/rss', mediaType: 'tv' },
        ],
      }),
    );
    expect(await getSetupState(path)).toBe('ready');
  });

  it('returns "partially_configured" for TV feeds when tv.shows empty', async () => {
    const path = join(dir, 'tv-empty-shows.json');
    await Bun.write(
      path,
      JSON.stringify({
        transmission: { url: 'http://mybox:9091/transmission/rpc' },
        movies: {
          years: [2024],
          resolutions: ['1080p'],
          codecs: ['x264'],
          codecPolicy: 'prefer',
        },
        tv: {
          defaults: { resolutions: ['1080p'], codecs: ['x264'] },
          shows: [],
        },
        feeds: [
          { name: 'rss', url: 'https://example.com/rss', mediaType: 'tv' },
        ],
      }),
    );
    expect(await getSetupState(path)).toBe('partially_configured');
  });

  it('returns "partially_configured" for movie feeds when movies absent', async () => {
    const path = join(dir, 'movie-no-config.json');
    await Bun.write(
      path,
      JSON.stringify({
        transmission: { url: 'http://mybox:9091/transmission/rpc' },
        tv: {
          defaults: { resolutions: ['1080p'], codecs: ['x264'] },
          shows: ['Breaking Bad'],
        },
        feeds: [
          { name: 'rss', url: 'https://example.com/rss', mediaType: 'movie' },
        ],
      }),
    );
    expect(await getSetupState(path)).toBe('partially_configured');
  });
});
