import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import {
  adoptMoviesFromPlex,
  ensurePlexMovieCatalogCacheSchema,
  matchCachedPlexCatalog,
  PlexMovieCatalogCache,
  recordPlexMatches,
} from '../src/adoption/movie-plex-reconciler';
import type { MovieAdoptionCandidate } from '../src/adoption/movie-reconciler';
import { ManualMovieGrabsStore } from '../src/manual-movie-grabs/store';
import { PlexHttpClient } from '../src/plex/client';
import { ensureSchema } from '../src/repository';

const servers: Array<ReturnType<typeof Bun.serve>> = [];
afterEach(() => {
  while (servers.length > 0) servers.pop()?.stop(true);
});

/** A fake Plex server exposing one movie library section whose `/all`
 * listing returns the given `<Video>` rows verbatim (so tests control the
 * Guid shape directly). */
function startPlexServer(videoRows: string): PlexHttpClient {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/library/sections': () =>
        new Response(
          `<MediaContainer size="1"><Directory key="1" type="movie" title="Movies"/></MediaContainer>`,
          { headers: { 'Content-Type': 'application/xml' } },
        ),
      '/library/sections/1/all': () =>
        new Response(
          `<MediaContainer size="1" totalSize="${videoRowCount(videoRows)}" offset="0">${videoRows}</MediaContainer>`,
          { headers: { 'Content-Type': 'application/xml' } },
        ),
    },
  });
  servers.push(server);
  return new PlexHttpClient(server.url.origin, 'token', () => {});
}

function videoRowCount(videoRows: string): number {
  return (videoRows.match(/<Video/g) ?? []).length;
}

function freshStore(): {
  database: Database;
  manualMovieGrabs: ManualMovieGrabsStore;
} {
  const database = new Database(':memory:');
  ensureSchema(database);
  return { database, manualMovieGrabs: new ManualMovieGrabsStore(database) };
}

function candidate(
  overrides: Partial<MovieAdoptionCandidate> = {},
): MovieAdoptionCandidate {
  return {
    tmdbId: 942353,
    title: 'The Odyssey',
    releaseDate: '2026-11-17',
    imdbId: 'tt22084616',
    posterUrl: null,
    alreadyGrabbed: false,
    ...overrides,
  };
}

describe('adoptMoviesFromPlex', () => {
  it('adopts a candidate matched by tmdb:// guid', async () => {
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="The Odyssey" year="2026"><Guid id="tmdb://942353"/><Guid id="imdb://tt00000000"/></Video>`,
    );
    const { database, manualMovieGrabs } = freshStore();

    const adopted = await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs,
      database,
      catalogCache: new PlexMovieCatalogCache(),
    });

    expect(adopted).toEqual(new Set([942353]));
    expect(manualMovieGrabs.listGrabbedTmdbIds()).toEqual(new Set([942353]));
    const [recorded] = manualMovieGrabs.listForMovie(942353);
    expect(recorded.source).toBe('adopted-plex');
    expect(recorded.movieYear).toBe(2026);
  });

  it('falls back to imdb:// guid when no tmdb guid is present', async () => {
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="The Odyssey" year="2026"><Guid id="imdb://tt22084616"/></Video>`,
    );
    const { database, manualMovieGrabs } = freshStore();

    const adopted = await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs,
      database,
      catalogCache: new PlexMovieCatalogCache(),
    });

    expect(adopted).toEqual(new Set([942353]));
  });

  it('skips a candidate whose Plex entry has neither guid — no fuzzy title/year fallback', async () => {
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="The Odyssey" year="2026"/>`,
    );
    const { database, manualMovieGrabs } = freshStore();

    const adopted = await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs,
      database,
      catalogCache: new PlexMovieCatalogCache(),
    });

    expect(adopted.size).toBe(0);
    expect(manualMovieGrabs.listGrabbedTmdbIds().size).toBe(0);
  });

  it('skips a candidate not present in the Plex catalog at all', async () => {
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="Some Other Movie" year="2020"><Guid id="tmdb://1"/></Video>`,
    );
    const { database, manualMovieGrabs } = freshStore();

    const adopted = await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs,
      database,
      catalogCache: new PlexMovieCatalogCache(),
    });

    expect(adopted.size).toBe(0);
  });

  it('skips a candidate already marked alreadyGrabbed without ever calling Plex', async () => {
    let requested = false;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      routes: {
        '/library/sections': () => {
          requested = true;
          return new Response('<MediaContainer/>');
        },
      },
    });
    servers.push(server);
    const plexClient = new PlexHttpClient(server.url.origin, 'token', () => {});
    const { database, manualMovieGrabs } = freshStore();

    const adopted = await adoptMoviesFromPlex(
      [candidate({ alreadyGrabbed: true })],
      {
        plexClient,
        manualMovieGrabs,
        database,
        catalogCache: new PlexMovieCatalogCache(),
      },
    );

    expect(adopted.size).toBe(0);
    expect(requested).toBe(false);
  });
});

describe('PlexMovieCatalogCache', () => {
  it('reuses the catalog across calls sharing the same cache instance — only one request to Plex', async () => {
    let sectionRequests = 0;
    let allRequests = 0;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      routes: {
        '/library/sections': () => {
          sectionRequests += 1;
          return new Response(
            `<MediaContainer size="1"><Directory key="1" type="movie" title="Movies"/></MediaContainer>`,
            { headers: { 'Content-Type': 'application/xml' } },
          );
        },
        '/library/sections/1/all': () => {
          allRequests += 1;
          return new Response(
            `<MediaContainer size="1" totalSize="1" offset="0"><Video ratingKey="1" type="movie" title="The Odyssey" year="2026"><Guid id="tmdb://942353"/></Video></MediaContainer>`,
            { headers: { 'Content-Type': 'application/xml' } },
          );
        },
      },
    });
    servers.push(server);
    const plexClient = new PlexHttpClient(server.url.origin, 'token', () => {});
    const catalogCache = new PlexMovieCatalogCache();

    const first = freshStore();
    await adoptMoviesFromPlex([candidate({ tmdbId: 1 })], {
      plexClient,
      manualMovieGrabs: first.manualMovieGrabs,
      database: first.database,
      catalogCache,
    });
    const second = freshStore();
    await adoptMoviesFromPlex([candidate({ tmdbId: 2 })], {
      plexClient,
      manualMovieGrabs: second.manualMovieGrabs,
      database: second.database,
      catalogCache,
    });

    expect(sectionRequests).toBe(1);
    expect(allRequests).toBe(1);
  });

  it('does NOT reuse the catalog across two independent cache instances', async () => {
    let allRequests = 0;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      routes: {
        '/library/sections': () =>
          new Response(
            `<MediaContainer size="1"><Directory key="1" type="movie" title="Movies"/></MediaContainer>`,
            { headers: { 'Content-Type': 'application/xml' } },
          ),
        '/library/sections/1/all': () => {
          allRequests += 1;
          return new Response(
            `<MediaContainer size="1" totalSize="0" offset="0"></MediaContainer>`,
            { headers: { 'Content-Type': 'application/xml' } },
          );
        },
      },
    });
    servers.push(server);
    const plexClient = new PlexHttpClient(server.url.origin, 'token', () => {});

    const first = freshStore();
    await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs: first.manualMovieGrabs,
      database: first.database,
      catalogCache: new PlexMovieCatalogCache(),
    });
    const second = freshStore();
    await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs: second.manualMovieGrabs,
      database: second.database,
      catalogCache: new PlexMovieCatalogCache(),
    });

    expect(allRequests).toBe(2);
  });

  it('persists to SQLite — a fresh instance sharing the database peeks the catalog without fetching', async () => {
    const database = new Database(':memory:');
    ensurePlexMovieCatalogCacheSchema(database);
    let allRequests = 0;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      routes: {
        '/library/sections': () =>
          new Response(
            `<MediaContainer size="1"><Directory key="1" type="movie" title="Movies"/></MediaContainer>`,
            { headers: { 'Content-Type': 'application/xml' } },
          ),
        '/library/sections/1/all': () => {
          allRequests += 1;
          return new Response(
            `<MediaContainer size="1" totalSize="1" offset="0"><Video ratingKey="1" type="movie" title="The Odyssey" year="2026"><Guid id="tmdb://942353"/></Video></MediaContainer>`,
            { headers: { 'Content-Type': 'application/xml' } },
          );
        },
      },
    });
    servers.push(server);
    const plexClient = new PlexHttpClient(server.url.origin, 'token', () => {});

    const first = new PlexMovieCatalogCache(database);
    await first.get(plexClient);
    expect(allRequests).toBe(1);

    // A brand-new instance never wrote to memory — peek() can only see the
    // catalog if it truly persisted to SQLite, simulating a daemon restart.
    const second = new PlexMovieCatalogCache(database);
    expect(second.peek()).toHaveLength(1);
    expect(allRequests).toBe(1); // peek() never fetches
  });

  it('invalidate() clears both the in-memory and SQLite copies', async () => {
    const database = new Database(':memory:');
    ensurePlexMovieCatalogCacheSchema(database);
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      routes: {
        '/library/sections': () =>
          new Response(
            `<MediaContainer size="1"><Directory key="1" type="movie" title="Movies"/></MediaContainer>`,
            { headers: { 'Content-Type': 'application/xml' } },
          ),
        '/library/sections/1/all': () =>
          new Response(
            `<MediaContainer size="1" totalSize="1" offset="0"><Video ratingKey="1" type="movie" title="The Odyssey" year="2026"><Guid id="tmdb://942353"/></Video></MediaContainer>`,
            { headers: { 'Content-Type': 'application/xml' } },
          ),
      },
    });
    servers.push(server);
    const plexClient = new PlexHttpClient(server.url.origin, 'token', () => {});

    const cache = new PlexMovieCatalogCache(database);
    await cache.get(plexClient);
    expect(cache.peek()).toHaveLength(1);

    cache.invalidate();
    expect(cache.peek()).toBeUndefined();
    expect(new PlexMovieCatalogCache(database).peek()).toBeUndefined();
  });

  it('peekIndex() builds the tmdbId/imdbId index once and reuses it across calls', async () => {
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="The Odyssey" year="2026"><Guid id="tmdb://942353"/><Guid id="imdb://tt22084616"/></Video>`,
    );
    const catalogCache = new PlexMovieCatalogCache();
    await catalogCache.get(plexClient);

    const first = catalogCache.peekIndex();
    const second = catalogCache.peekIndex();
    expect(first).toBe(second); // same object reference — not rebuilt
    expect(first?.byTmdbId.get(942353)?.title).toBe('The Odyssey');
    expect(first?.byImdbId.get('tt22084616')?.title).toBe('The Odyssey');
  });

  it('peekIndex() returns undefined when nothing is cached yet', () => {
    expect(new PlexMovieCatalogCache().peekIndex()).toBeUndefined();
  });
});

describe('matchCachedPlexCatalog + recordPlexMatches (the per-view, network-free path)', () => {
  it('matchCachedPlexCatalog never contacts Plex — an empty/never-synced cache matches nothing', () => {
    const catalogCache = new PlexMovieCatalogCache();
    const matches = matchCachedPlexCatalog([candidate()], catalogCache);
    expect(matches.size).toBe(0);
    expect(catalogCache.peek()).toBeUndefined();
  });

  it('matches and records against an already-populated cache, with no further I/O', async () => {
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="The Odyssey" year="2026"><Guid id="tmdb://942353"/></Video>`,
    );
    const catalogCache = new PlexMovieCatalogCache();
    await catalogCache.get(plexClient); // pre-populate, as a manual sync would

    const matches = matchCachedPlexCatalog([candidate()], catalogCache);
    expect([...matches.keys()]).toEqual([942353]);

    const { database, manualMovieGrabs } = freshStore();
    const adopted = recordPlexMatches(
      [candidate()],
      matches,
      manualMovieGrabs,
      database,
      () => {},
    );
    expect(adopted).toEqual(new Set([942353]));
    const [recorded] = manualMovieGrabs.listForMovie(942353);
    expect(recorded.source).toBe('adopted-plex');
  });

  it('matchCachedPlexCatalog still matches a candidate already marked alreadyGrabbed', async () => {
    // Unlike adoptMoviesFromPlex (which only cares about NEW adoptions and
    // filters alreadyGrabbed internally), matchCachedPlexCatalog is the
    // per-view display check — a movie grabbed via YTS/RSS that Plex later
    // confirms owning should still show as in the library, so this must
    // keep matching it rather than silently skipping it forever. See its
    // own doc comment.
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="The Odyssey" year="2026"><Guid id="tmdb://942353"/></Video>`,
    );
    const catalogCache = new PlexMovieCatalogCache();
    await catalogCache.get(plexClient);

    const matches = matchCachedPlexCatalog(
      [candidate({ alreadyGrabbed: true })],
      catalogCache,
    );
    expect(matches.size).toBe(1);
    expect(matches.has(942353)).toBe(true);
  });

  it('recordPlexMatches on an empty match set records nothing and never opens a transaction', () => {
    const { database, manualMovieGrabs } = freshStore();
    const adopted = recordPlexMatches(
      [candidate()],
      new Map(),
      manualMovieGrabs,
      database,
      () => {},
    );
    expect(adopted.size).toBe(0);
    expect(manualMovieGrabs.listGrabbedTmdbIds().size).toBe(0);
  });
});
