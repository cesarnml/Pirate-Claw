import { afterEach, describe, expect, it } from 'bun:test';

import type { FeedConfig } from '../src/config';
import { FeedError, fetchFeed } from '../src/feed';

const servers: Array<ReturnType<typeof Bun.serve>> = [];
const originalFetch = globalThis.fetch;

describe('fetchFeed', () => {
  afterEach(() => {
    while (servers.length > 0) {
      const server = servers.pop();

      if (server) {
        server.stop(true);
      }
    }

    globalThis.fetch = originalFetch;
  });

  it('parses multiple TV-style RSS items and prefers enclosure url over link', async () => {
    const server = await startFeedServer(200, tvFeedFixture);
    const feed = createFeedConfig('TV Feed', `${server.url}/eztv`, 'tv');

    const items = await fetchFeed(feed);

    expect(items).toEqual([
      {
        feedName: 'TV Feed',
        guidOrLink: 'eztv-1001',
        rawTitle: 'Example Show S01E02 1080p WEB h264',
        publishedAt: '2026-03-29T10:15:00.000Z',
        downloadUrl: 'https://torrents.example.test/tv/1001.torrent',
      },
      {
        feedName: 'TV Feed',
        guidOrLink: 'https://download.example.test/tv/1002',
        rawTitle: 'Example Show S01E03 1080p WEB x265',
        publishedAt: '2026-03-29T11:30:00.000Z',
        downloadUrl: 'https://torrents.example.test/tv/1002.torrent',
      },
    ]);
  });

  it('parses multiple movie-style RSS items with enclosure-first download urls', async () => {
    const server = await startFeedServer(200, movieFeedFixture);
    const feed = createFeedConfig('Movie Feed', `${server.url}/feed`, 'movie');

    const items = await fetchFeed(feed);

    expect(items).toEqual([
      {
        feedName: 'Movie Feed',
        guidOrLink: 'atlas-2001',
        rawTitle: 'Example Movie 2024 1080p WEB-DL x265',
        publishedAt: '2026-03-29T06:00:00.000Z',
        downloadUrl: 'https://torrents.example.test/movie/2001.torrent',
      },
      {
        feedName: 'Movie Feed',
        guidOrLink: 'atlas-2002',
        rawTitle: 'Another Movie 2024 2160p WEB-DL x265',
        publishedAt: '2026-03-29T08:45:00.000Z',
        downloadUrl: 'https://torrents.example.test/movie/2002.torrent',
      },
    ]);
  });

  it('falls back to link when an item does not include an enclosure url', async () => {
    const server = await startFeedServer(200, linkOnlyFeedFixture);
    const feed = createFeedConfig(
      'Fallback Feed',
      `${server.url}/fallback`,
      'movie',
    );

    const items = await fetchFeed(feed);

    expect(items).toEqual([
      {
        feedName: 'Fallback Feed',
        guidOrLink: 'fallback-3001',
        rawTitle: 'Fallback Movie 2024 1080p WEB-DL',
        publishedAt: '2026-03-29T09:15:00.000Z',
        downloadUrl: 'https://download.example.test/movie/fallback-3001',
      },
    ]);
  });

  it('fails with a readable error when the feed responds with a non-OK status', async () => {
    const server = await startFeedServer(503, '<rss><channel /></rss>');
    const feed = createFeedConfig('TV Feed', `${server.url}/eztv`, 'tv');

    await expect(fetchFeed(feed)).rejects.toThrow(
      new FeedError(
        `Failed to fetch feed "TV Feed" from ${server.url}/eztv: HTTP 503.`,
      ),
    );
  });

  it('fails with a readable error when fetch throws before a response is returned', async () => {
    globalThis.fetch = Object.assign(
      async () => {
        throw new Error('connect ECONNREFUSED');
      },
      {
        preconnect: originalFetch.preconnect.bind(originalFetch),
      },
    );

    const feed = createFeedConfig(
      'TV Feed',
      'https://user:secret@example.test/eztv?token=abc123',
      'tv',
    );

    await expect(fetchFeed(feed)).rejects.toThrow(
      new FeedError(
        'Failed to fetch feed "TV Feed" from https://example.test/eztv: connect ECONNREFUSED.',
      ),
    );
  });

  it('fails when the feed returns malformed XML', async () => {
    const server = await startFeedServer(
      200,
      '<rss><channel><item><title>Broken',
    );
    const feed = createFeedConfig('TV Feed', `${server.url}/broken`, 'tv');

    await expect(fetchFeed(feed)).rejects.toThrow(
      new FeedError('Feed "TV Feed" returned malformed RSS XML.'),
    );
  });

  it('fails when an RSS item is missing required fields', async () => {
    const server = await startFeedServer(200, missingTitleFixture);
    const feed = createFeedConfig(
      'Movie Feed',
      `${server.url}/missing`,
      'movie',
    );

    await expect(fetchFeed(feed)).rejects.toThrow(
      new FeedError('Feed "Movie Feed" item 1 is missing required <title>.'),
    );
  });
});

function createFeedConfig(
  name: string,
  url: string,
  mediaType: FeedConfig['mediaType'],
): FeedConfig {
  return {
    name,
    url,
    mediaType,
  };
}

async function startFeedServer(
  status: number,
  body: string,
): Promise<{ url: string }> {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch() {
      return new Response(body, {
        status,
        headers: {
          'content-type': 'application/rss+xml; charset=utf-8',
        },
      });
    },
  });

  servers.push(server);
  return { url: server.url.origin };
}

const tvFeedFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>TV Feed</title>
    <item>
      <title><![CDATA[Example Show S01E02 1080p WEB h264]]></title>
      <link>https://download.example.test/tv/1001</link>
      <enclosure url="https://torrents.example.test/tv/1001.torrent" type="application/x-bittorrent" />
      <guid isPermaLink="false">eztv-1001</guid>
      <pubDate>Sun, 29 Mar 2026 10:15:00 GMT</pubDate>
    </item>
    <item>
      <title>Example Show S01E03 1080p WEB x265</title>
      <link>https://download.example.test/tv/1002</link>
      <enclosure url="https://torrents.example.test/tv/1002.torrent" type="application/x-bittorrent" />
      <pubDate>Sun, 29 Mar 2026 11:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const movieFeedFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Movie Feed</title>
    <item>
      <title>Example Movie 2024 1080p WEB-DL x265</title>
      <link>https://download.example.test/movie/2001</link>
      <enclosure url="https://torrents.example.test/movie/2001.torrent" type="application/x-bittorrent" />
      <guid isPermaLink="false">atlas-2001</guid>
      <pubDate>Sun, 29 Mar 2026 06:00:00 GMT</pubDate>
    </item>
    <item>
      <title><![CDATA[Another Movie 2024 2160p WEB-DL x265]]></title>
      <link>https://download.example.test/movie/2002</link>
      <enclosure url="https://torrents.example.test/movie/2002.torrent" type="application/x-bittorrent" />
      <guid isPermaLink="false">atlas-2002</guid>
      <pubDate>Sun, 29 Mar 2026 08:45:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const linkOnlyFeedFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Fallback Feed</title>
    <item>
      <title>Fallback Movie 2024 1080p WEB-DL</title>
      <link>https://download.example.test/movie/fallback-3001</link>
      <guid isPermaLink="false">fallback-3001</guid>
      <pubDate>Sun, 29 Mar 2026 09:15:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const missingTitleFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Broken Feed</title>
    <item>
      <link>https://download.example.test/movie/missing-title</link>
      <guid isPermaLink="false">missing-title</guid>
      <pubDate>Sun, 29 Mar 2026 09:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
