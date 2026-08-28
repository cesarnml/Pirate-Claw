import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { PlexAuthStore } from '../src/plex/auth';
import {
  exchangePlexPinForAuthToken,
  PlexRateLimitError,
  refreshPlexAuthToken,
} from '../src/plex/auth-client';
import { ensureSchema } from '../src/repository';

const openDatabases: Database[] = [];

function freshIdentity() {
  const database = new Database(':memory:');
  openDatabases.push(database);
  ensureSchema(database);
  return {
    database,
    identity: new PlexAuthStore(database).ensureIdentity(
      '2026-08-28T00:00:00.000Z',
    ),
  };
}

describe('Plex auth-client JWT-to-legacy-token exchange', () => {
  afterEach(() => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }
  });

  it('refreshPlexAuthToken exchanges the minted JWT for this device legacy token', async () => {
    const { identity } = freshIdentity();

    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      const url = String(input);
      if (url.endsWith('/api/v2/auth/nonce')) {
        return new Response(JSON.stringify({ nonce: 'n' }), { status: 200 });
      }
      if (url.endsWith('/api/v2/auth/token')) {
        return new Response(
          JSON.stringify({ auth_token: 'jwt.shaped.token' }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/v2/devices')) {
        return new Response(
          JSON.stringify([
            {
              clientIdentifier: identity.clientIdentifier,
              token: 'legacy-abc',
            },
            { clientIdentifier: 'someone-else', token: 'not-mine' },
          ]),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch);

    try {
      const token = await refreshPlexAuthToken({
        clientIdentifier: identity.clientIdentifier,
        identity,
      });
      expect(token).toBe('legacy-abc');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('surfaces a 429 from the devices exchange as PlexRateLimitError', async () => {
    const { identity } = freshIdentity();

    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      const url = String(input);
      if (url.endsWith('/api/v2/auth/nonce')) {
        return new Response(JSON.stringify({ nonce: 'n' }), { status: 200 });
      }
      if (url.endsWith('/api/v2/auth/token')) {
        return new Response(
          JSON.stringify({ auth_token: 'jwt.shaped.token' }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/v2/devices')) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '7' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch);

    try {
      await expect(
        refreshPlexAuthToken({
          clientIdentifier: identity.clientIdentifier,
          identity,
        }),
      ).rejects.toThrow(PlexRateLimitError);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('exchangePlexPinForAuthToken exchanges a linked PIN JWT for the legacy token too', async () => {
    const { identity } = freshIdentity();

    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      const url = String(input);
      if (url.endsWith('/api/v2/pins/99')) {
        return new Response(JSON.stringify({ authToken: 'jwt.shaped.token' }), {
          status: 200,
        });
      }
      if (url.endsWith('/api/v2/devices')) {
        return new Response(
          JSON.stringify([
            {
              clientIdentifier: identity.clientIdentifier,
              token: 'legacy-pin',
            },
          ]),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch);

    try {
      const token = await exchangePlexPinForAuthToken({
        clientIdentifier: identity.clientIdentifier,
        pinId: 99,
      });
      expect(token).toBe('legacy-pin');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('surfaces a 429 from the devices exchange during PIN finalize as PlexRateLimitError', async () => {
    const { identity } = freshIdentity();

    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      const url = String(input);
      if (url.endsWith('/api/v2/pins/99')) {
        return new Response(JSON.stringify({ authToken: 'jwt.shaped.token' }), {
          status: 200,
        });
      }
      if (url.endsWith('/api/v2/devices')) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '3' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch);

    try {
      await expect(
        exchangePlexPinForAuthToken({
          clientIdentifier: identity.clientIdentifier,
          pinId: 99,
        }),
      ).rejects.toThrow(PlexRateLimitError);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('treats a not-yet-propagated device after PIN link as still-pending, not a hard failure', async () => {
    const { identity } = freshIdentity();

    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      const url = String(input);
      if (url.endsWith('/api/v2/pins/99')) {
        return new Response(JSON.stringify({ authToken: 'jwt.shaped.token' }), {
          status: 200,
        });
      }
      if (url.endsWith('/api/v2/devices')) {
        // Plex just linked the PIN, but this device hasn't shown up in
        // /api/v2/devices yet — plausible propagation lag, not a real error.
        return new Response(
          JSON.stringify([{ clientIdentifier: 'someone-else', token: 'x' }]),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch);

    try {
      const token = await exchangePlexPinForAuthToken({
        clientIdentifier: identity.clientIdentifier,
        pinId: 99,
      });
      // null == "still pending", the same signal as PIN-not-yet-linked —
      // the callback page's own retry/timeout handles it from here, instead
      // of the whole sign-in hard-failing on a transient propagation lag.
      expect(token).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
