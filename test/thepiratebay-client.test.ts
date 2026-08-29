import { describe, expect, it, spyOn } from 'bun:test';

import { ThePirateBayHttpClient } from '../src/thepiratebay/client';

// Shaped like the real response confirmed live against apibay.org while
// building this feature (The Walking Dead: Dead City S01E03).
const RESPONSE_BODY = [
  {
    id: '69899793',
    name: 'The.Walking.Dead.Dead.City.S01E03.1080p.WEB.h264-ETHEL[TGx]',
    info_hash: '3DE1EA029B5AAFF6C401A6F8830B04E39516BA15',
    leechers: '1',
    seeders: '13',
    size: '2827898242',
    num_files: '4',
    username: 'TGxGoodies',
    added: '1688024476',
    status: 'vip',
    category: '208',
    imdb: 'tt18546730',
  },
  {
    // No imdb tag — must still parse; imdbId should come back null.
    id: '69900453',
    name: 'The Walking Dead Dead City S01E03 1080p WEB h264-ETHEL',
    info_hash: '8FB652889C74954CB63E7917FEA397FD467F6FD9',
    leechers: '0',
    seeders: '9',
    size: '2823940997',
    category: '208',
    added: '1688026811',
    imdb: '',
  },
  {
    // Movie category (207) mixed into the same result set — must be
    // filtered out, this is a TV-only search.
    id: '69900412',
    name: 'The.Walking.Dead.Dead.City.Movie.2023.1080p',
    info_hash: 'CA8A62F254DB0C96EECA411E9747C68E3FFE64FB',
    leechers: '0',
    seeders: '4',
    size: '291940411',
    category: '207',
    added: '1688025384',
    imdb: '',
  },
];

const NO_RESULTS_BODY = [
  {
    id: '0',
    name: 'No results returned',
    info_hash: '0000000000000000000000000000000000000000',
    leechers: '0',
    seeders: '0',
    size: '0',
    category: '0',
    added: '0',
  },
];

describe('ThePirateBayHttpClient', () => {
  it('parses torrents, filters to TV categories, and builds a magnet link with known trackers', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(RESPONSE_BODY), {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new ThePirateBayHttpClient(() => {});
      const outcome = await client.search('The Walking Dead Dead City S01E03');

      if (!outcome.ok) throw new Error('expected ok outcome');
      const { torrents } = outcome;
      expect(torrents).toHaveLength(2);
      expect(torrents[0]).toMatchObject({
        id: 69899793,
        title: 'The.Walking.Dead.Dead.City.S01E03.1080p.WEB.h264-ETHEL[TGx]',
        seeds: 13,
        peers: 1,
        imdbId: 'tt18546730',
      });
      expect(torrents[0].magnetUrl).toContain(
        'xt=urn:btih:3DE1EA029B5AAFF6C401A6F8830B04E39516BA15',
      );
      expect(torrents[0].magnetUrl).toContain('&tr=');
      expect(torrents[1].imdbId).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('treats the "no results" sentinel row as an empty list, not a real hit', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(NO_RESULTS_BODY), {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new ThePirateBayHttpClient(() => {});
      const outcome = await client.search('a show that does not exist');
      expect(outcome).toEqual({ ok: true, torrents: [] });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns ok:false reason:"error" on a non-200 response, best-effort with no retry', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('nope', { status: 503 })) as unknown as typeof fetch,
    );

    try {
      const client = new ThePirateBayHttpClient(() => {});
      expect(await client.search('anything')).toEqual({
        ok: false,
        reason: 'error',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns ok:false reason:"error" on a network failure', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    );

    try {
      const client = new ThePirateBayHttpClient(() => {});
      expect(await client.search('anything')).toEqual({
        ok: false,
        reason: 'error',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns ok:false reason:"timeout" when our own deadline elapses first, distinct from a genuine network failure', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      }) as unknown as typeof fetch,
    );

    try {
      const client = new ThePirateBayHttpClient(() => {});
      expect(await client.search('anything')).toEqual({
        ok: false,
        reason: 'timeout',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('warns loudly when results exist but every one gets filtered out by category', async () => {
    const movieOnlyBody = [RESPONSE_BODY[2]]; // category 207, filtered TV_CATEGORIES = {205, 208}
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(movieOnlyBody), {
          status: 200,
        })) as unknown as typeof fetch,
    );
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const client = new ThePirateBayHttpClient(() => {});
      const outcome = await client.search('a query matching only a movie');

      expect(outcome).toEqual({ ok: true, torrents: [] });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain(
        'all 1 real result(s) were filtered out by category',
      );
      expect(warnSpy.mock.calls[0][0]).toContain('"207"');
    } finally {
      fetchMock.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('logs the response body on a non-200 so a block/rate-limit page is diagnosable', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('rate limited, try again later', {
          status: 429,
        })) as unknown as typeof fetch,
    );
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const client = new ThePirateBayHttpClient(() => {});
      expect(await client.search('anything')).toEqual({
        ok: false,
        reason: 'error',
      });
      expect(errorSpy.mock.calls[0][0]).toContain('status=429');
      expect(errorSpy.mock.calls[0][0]).toContain(
        'rate limited, try again later',
      );
    } finally {
      fetchMock.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('returns ok:false reason:"error" on a malformed (non-array) response body', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify({ unexpected: 'shape' }), {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new ThePirateBayHttpClient(() => {});
      expect(await client.search('anything')).toEqual({
        ok: false,
        reason: 'error',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('filters to movie categories (201/207) instead of TV when mediaType is "movie"', async () => {
    const mixedBody = [RESPONSE_BODY[0], RESPONSE_BODY[2]]; // category 208 (TV), category 207 (movie)
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(mixedBody), {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new ThePirateBayHttpClient(() => {});
      const outcome = await client.search(
        'a query matching both media types',
        'movie',
      );

      if (!outcome.ok) throw new Error('expected ok outcome');
      expect(outcome.torrents).toHaveLength(1);
      expect(outcome.torrents[0]).toMatchObject({ id: 69900412 });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('defaults to TV categories when mediaType is omitted, unchanged from before movie support', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(RESPONSE_BODY), {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new ThePirateBayHttpClient(() => {});
      const outcome = await client.search('The Walking Dead Dead City S01E03');
      if (!outcome.ok) throw new Error('expected ok outcome');
      expect(outcome.torrents).toHaveLength(2);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
