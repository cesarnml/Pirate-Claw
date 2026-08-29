import { describe, expect, it, spyOn } from 'bun:test';

import { YtsHttpClient } from '../src/yts/client';

// Shaped like the real response confirmed live against yts.gg while
// building this feature (The Hockey Player, tt42615581).
const MOVIE_DETAILS_BODY = {
  status: 'ok',
  status_message: 'Query was successful.',
  data: {
    movie: {
      id: 78173,
      title_long: 'The Hockey Player (2026)',
      torrents: [
        {
          hash: 'A2DCC1BF9560724C7320D69A2CB0712C1F82B2C9',
          quality: '720p',
          type: 'web',
          video_codec: 'x264',
          seeds: 3,
          peers: 1,
          size_bytes: 752992911,
        },
        {
          // Missing hash — must be dropped, not crash the mapper.
          quality: '1080p',
          video_codec: 'x264',
          seeds: 0,
          peers: 0,
        },
      ],
    },
  },
};

const NO_MOVIE_BODY = {
  status: 'movie_not_found',
};

describe('YtsHttpClient', () => {
  it('parses declared quality/codec/size fields and builds a magnet link with known trackers', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(MOVIE_DETAILS_BODY), {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new YtsHttpClient(() => {});
      const torrents = await client.search('tt42615581');

      expect(torrents).toHaveLength(1);
      expect(torrents?.[0]).toMatchObject({
        infoHash: 'A2DCC1BF9560724C7320D69A2CB0712C1F82B2C9',
        resolution: '720p',
        codec: 'x264',
        seeds: 3,
        peers: 1,
        sizeBytes: 752992911,
      });
      expect(torrents?.[0].magnetUrl).toContain(
        'xt=urn:btih:A2DCC1BF9560724C7320D69A2CB0712C1F82B2C9',
      );
      expect(torrents?.[0].magnetUrl).toContain('&tr=');
      expect(torrents?.[0].title).toContain('The Hockey Player');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns [] (not null) when YTS has no release for this IMDb id', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(NO_MOVIE_BODY), {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new YtsHttpClient(() => {});
      expect(await client.search('tt00000000')).toEqual([]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns null on a non-200 response, best-effort with no retry', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('nope', { status: 503 })) as unknown as typeof fetch,
    );

    try {
      const client = new YtsHttpClient(() => {});
      expect(await client.search('tt42615581')).toBeNull();
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
      const client = new YtsHttpClient(() => {});
      expect(await client.search('tt42615581')).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns null on malformed JSON', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('not json', { status: 200 })) as unknown as typeof fetch,
    );

    try {
      const client = new YtsHttpClient(() => {});
      expect(await client.search('tt42615581')).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
