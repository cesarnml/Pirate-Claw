import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';

import {
  loggedFetch,
  logClientError,
  redactUrl,
  setHttpLogDirForTest,
} from '../src/http-log';

// The rotation tests below write real ~10MB files to prove rotation actually
// triggers at the byte threshold — left uncleaned, repeated `bun test` runs
// on this NAS silently filled the 2.3GB root partition to 100% (each run
// leaked ~2 fresh 10MB+ dirs under the system tmpdir; discovered live after
// ~13 accumulated runs). Every dir mkdtemp() hands out is tracked here and
// removed in the top-level afterEach below, regardless of which describe
// block created it.
const createdDirs: string[] = [];

async function mkdtemp(): Promise<string> {
  const dir = join(
    tmpdir(),
    `pirate-claw-http-log-${Date.now()}-${Math.random()}`,
  );
  mkdirSync(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function readActiveLog(dir: string): string[] {
  const path = join(dir, 'http.log');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
}

describe('redactUrl', () => {
  it('replaces known secret query params with a placeholder', () => {
    const url =
      'https://api.example.com/3/movie/1?api_key=super-secret&lang=en';
    expect(redactUrl(url)).toBe(
      'https://api.example.com/3/movie/1?api_key=REDACTED&lang=en',
    );
  });

  it('leaves URLs without secret params untouched', () => {
    const url = 'https://example.com/pins/12345';
    expect(redactUrl(url)).toBe(url);
  });

  it('returns the original string for an unparseable URL rather than throwing', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});

describe('loggedFetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setHttpLogDirForTest(undefined);
  });

  it('logs method, redacted url, status, and timing on success', async () => {
    const dir = await mkdtemp();
    setHttpLogDirForTest(dir);
    globalThis.fetch = (async () =>
      new Response('ok', { status: 200 })) as unknown as typeof fetch;

    await loggedFetch('https://api.example.com/x?api_key=secret', undefined, {
      source: 'tmdb',
      label: 'search',
    });

    const lines = readActiveLog(dir);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      source: 'tmdb',
      label: 'search',
      method: 'GET',
      url: 'https://api.example.com/x?api_key=REDACTED',
      status: 200,
    });
    expect(typeof entry.durationMs).toBe('number');
  });

  it('logs an error entry and still rethrows when fetch rejects', async () => {
    const dir = await mkdtemp();
    setHttpLogDirForTest(dir);
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    await expect(
      loggedFetch('https://api.example.com/x', undefined, {
        source: 'plex',
      }),
    ).rejects.toThrow('network down');

    const lines = readActiveLog(dir);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      source: 'plex',
      error: 'network down',
    });
  });

  it('is a no-op writer when no log dir has been configured', async () => {
    setHttpLogDirForTest(undefined);
    globalThis.fetch = (async () =>
      new Response('ok', { status: 200 })) as unknown as typeof fetch;

    // Should not throw even though nothing is configured.
    const response = await loggedFetch('https://api.example.com/x', undefined, {
      source: 'feed',
    });
    expect(response.status).toBe(200);
  });

  it('rotates the active log to a backup once it grows past the size cap', async () => {
    const dir = await mkdtemp();
    setHttpLogDirForTest(dir);
    // Pre-seed an "active" log already past the 10MB rotation threshold.
    writeFileSync(join(dir, 'http.log'), 'x'.repeat(10 * 1024 * 1024 + 1));
    globalThis.fetch = (async () =>
      new Response('ok', { status: 200 })) as unknown as typeof fetch;

    await loggedFetch('https://api.example.com/x', undefined, {
      source: 'transmission',
    });

    expect(existsSync(join(dir, 'http.log.1'))).toBe(true);
    const backupSize = readFileSync(join(dir, 'http.log.1'), 'utf8').length;
    expect(backupSize).toBeGreaterThan(10 * 1024 * 1024);

    // The new active file holds only the entry written after rotation.
    const lines = readActiveLog(dir);
    expect(lines).toHaveLength(1);
  });

  it('overwrites a prior backup on a second rotation', async () => {
    const dir = await mkdtemp();
    setHttpLogDirForTest(dir);
    writeFileSync(join(dir, 'http.log.1'), 'stale backup content');
    writeFileSync(join(dir, 'http.log'), 'x'.repeat(10 * 1024 * 1024 + 1));
    globalThis.fetch = (async () =>
      new Response('ok', { status: 200 })) as unknown as typeof fetch;

    await loggedFetch('https://api.example.com/x', undefined, {
      source: 'transmission',
    });

    const backup = readFileSync(join(dir, 'http.log.1'), 'utf8');
    expect(backup).not.toContain('stale backup content');
  });
});

describe('logClientError', () => {
  afterEach(() => {
    setHttpLogDirForTest(undefined);
  });

  it('records a client-side render crash into the same rotating log', async () => {
    const dir = await mkdtemp();
    setHttpLogDirForTest(dir);

    logClientError({
      message: 'each_key_duplicate',
      stack: 'Error: ...',
      url: 'http://100.108.117.42:8888/calendar',
      label: 'calendar',
    });

    const lines = readActiveLog(dir);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      source: 'client',
      label: 'calendar',
      error: 'each_key_duplicate',
      stack: 'Error: ...',
      url: 'http://100.108.117.42:8888/calendar',
    });
  });

  it('is a no-op when no log dir has been configured', () => {
    setHttpLogDirForTest(undefined);
    // Should not throw even though nothing is configured.
    expect(() => logClientError({ message: 'boom' })).not.toThrow();
  });
});
