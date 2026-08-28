import { describe, expect, it, spyOn } from 'bun:test';

import { EztvHttpClient } from '../src/eztv/client';

// Shaped like the real response confirmed live against eztvx.to while
// building this feature (Star Trek: Strange New Worlds, imdb_id 12327578).
const RESPONSE_BODY = {
  imdb_id: '12327578',
  torrents_count: 3,
  torrents: [
    {
      id: 1,
      title: 'Star Trek Strange New Worlds S04E06 1080p HEVC x265-MeGusta',
      filename:
        'Star.Trek.Strange.New.Worlds.S04E06.1080p.HEVC.x265-MeGusta.mkv',
      magnet_url: 'magnet:?xt=urn:btih:abc123',
      season: '4',
      episode: '6',
      size_bytes: 500000000,
      seeds: 12,
      peers: 3,
      date_released_unix: 1787000000,
    },
    {
      id: 2,
      title: 'Star Trek Strange New Worlds S04E06 480p x264-mSD',
      filename: 'Star.Trek.Strange.New.Worlds.S04E06.480p.x264-mSD.mkv',
      magnet_url: 'magnet:?xt=urn:btih:def456',
      season: '4',
      episode: '6',
      size_bytes: 200000000,
      seeds: 1,
      peers: 0,
      date_released_unix: 1787000100,
    },
    {
      id: 3,
      title: 'Star Trek Strange New Worlds S04E05 1080p HEVC x265-MeGusta',
      filename:
        'Star.Trek.Strange.New.Worlds.S04E05.1080p.HEVC.x265-MeGusta.mkv',
      magnet_url: 'magnet:?xt=urn:btih:ghi789',
      season: '4',
      episode: '5',
      size_bytes: 480000000,
      seeds: 8,
      peers: 2,
      date_released_unix: 1786500000,
    },
  ],
};

describe('EztvHttpClient', () => {
  it('parses torrents and strips a leading tt from the imdb id in the request', async () => {
    let requestedUrl = '';
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(RESPONSE_BODY), { status: 200 });
    }) as unknown as typeof fetch);

    try {
      const client = new EztvHttpClient(() => {});
      const torrents = await client.getTorrents('tt12327578');
      expect(requestedUrl).toContain('imdb_id=12327578');
      expect(requestedUrl).not.toContain('imdb_id=tt');
      expect(torrents).toHaveLength(3);
      expect(torrents?.[0]).toMatchObject({
        season: 4,
        episode: 6,
        seeds: 12,
        magnetUrl: 'magnet:?xt=urn:btih:abc123',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('filters to one season+episode when asked', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(RESPONSE_BODY), {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new EztvHttpClient(() => {});
      const torrents = await client.getTorrents('12327578', {
        season: 4,
        episode: 6,
      });
      expect(torrents).toHaveLength(2);
      expect(torrents?.every((t) => t.season === 4 && t.episode === 6)).toBe(
        true,
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns null (not []) on a non-200 response, best-effort with no retry', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('nope', { status: 503 })) as unknown as typeof fetch,
    );

    try {
      const client = new EztvHttpClient(() => {});
      expect(await client.getTorrents('12327578')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns null on a network failure', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    );

    try {
      const client = new EztvHttpClient(() => {});
      expect(await client.getTorrents('12327578')).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
