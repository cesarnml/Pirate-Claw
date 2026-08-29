import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import { adoptMoviesFromPlex } from '../src/adoption/movie-plex-reconciler';
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

function freshStore(): ManualMovieGrabsStore {
  const database = new Database(':memory:');
  ensureSchema(database);
  return new ManualMovieGrabsStore(database);
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
    const manualMovieGrabs = freshStore();

    const adopted = await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs,
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
    const manualMovieGrabs = freshStore();

    const adopted = await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs,
    });

    expect(adopted).toEqual(new Set([942353]));
  });

  it('skips a candidate whose Plex entry has neither guid — no fuzzy title/year fallback', async () => {
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="The Odyssey" year="2026"/>`,
    );
    const manualMovieGrabs = freshStore();

    const adopted = await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs,
    });

    expect(adopted.size).toBe(0);
    expect(manualMovieGrabs.listGrabbedTmdbIds().size).toBe(0);
  });

  it('skips a candidate not present in the Plex catalog at all', async () => {
    const plexClient = startPlexServer(
      `<Video ratingKey="1" type="movie" title="Some Other Movie" year="2020"><Guid id="tmdb://1"/></Video>`,
    );
    const manualMovieGrabs = freshStore();

    const adopted = await adoptMoviesFromPlex([candidate()], {
      plexClient,
      manualMovieGrabs,
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
    const manualMovieGrabs = freshStore();

    const adopted = await adoptMoviesFromPlex(
      [candidate({ alreadyGrabbed: true })],
      { plexClient, manualMovieGrabs },
    );

    expect(adopted.size).toBe(0);
    expect(requested).toBe(false);
  });
});
