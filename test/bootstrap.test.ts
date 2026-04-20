import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureStarterConfig } from '../src/bootstrap';
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

    const year = new Date().getFullYear();
    expect(written.movies.years).toEqual([year - 1, year]);
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
      movies: {
        years: [2024, 2025],
        resolutions: ['1080p'],
        codecs: ['x264'],
        codecPolicy: 'prefer',
      },
      tv: { defaults: { resolutions: ['1080p'], codecs: ['x264'] }, shows: [] },
      feeds: [],
    };

    expect(() => validateConfig(config, 'test', {})).not.toThrow();
  });
});
