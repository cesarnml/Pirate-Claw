import { afterEach, describe, expect, it } from 'bun:test';

import type { TransmissionConfig } from '../src/config';
import {
  createTransmissionDownloader,
  type SubmissionFailure,
  type SubmissionFailureCode,
} from '../src/transmission';

const servers: Array<ReturnType<typeof Bun.serve>> = [];
const originalFetch = globalThis.fetch;

describe('Transmission adapter', () => {
  afterEach(() => {
    while (servers.length > 0) {
      const server = servers.pop();

      if (server) {
        server.stop(true);
      }
    }

    globalThis.fetch = originalFetch;
  });

  it('submits a torrent after negotiating a session id', async () => {
    const requests: CapturedRequest[] = [];
    let requestCount = 0;
    const server = startTransmissionServer(async (request) => {
      requests.push(await captureRequest(request));
      requestCount += 1;

      if (requestCount === 1) {
        return new Response(null, {
          status: 409,
          headers: {
            'x-transmission-session-id': 'session-123',
          },
        });
      }

      return Response.json({
        result: 'success',
        arguments: {
          'torrent-added': {
            id: 7,
            hashString: 'abcdef123456',
            name: 'Example Movie',
          },
        },
      });
    });
    const downloader = createTransmissionDownloader(
      createTransmissionConfig(server.url.origin, '/downloads/movies'),
    );

    const result = await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
    });

    expect(result).toEqual({
      ok: true,
      status: 'queued',
      torrentId: 7,
      torrentName: 'Example Movie',
      torrentHash: 'abcdef123456',
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.authorization).toBe(basicAuthHeader('pirate', 'claw'));
    expect(requests[0]?.sessionId).toBeNull();
    expect(requests[1]?.sessionId).toBe('session-123');
    expect(requests[1]?.contentType).toBe('application/json');

    expect(requests[1]!.json).toEqual({
      method: 'torrent-add',
      arguments: {
        filename: 'https://download.example.test/movie/example.torrent',
        'download-dir': '/downloads/movies',
      },
    });
  });

  it('returns a structured failure when Transmission rejects the RPC call', async () => {
    const server = startTransmissionServer((request) => {
      const sessionId = request.headers.get('x-transmission-session-id');

      if (!sessionId) {
        return new Response(null, {
          status: 409,
          headers: {
            'x-transmission-session-id': 'session-123',
          },
        });
      }

      return Response.json({
        result: 'duplicate torrent',
        arguments: {},
      });
    });
    const downloader = createTransmissionDownloader(
      createTransmissionConfig(server.url.origin),
    );

    const result = await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
    });

    expectFailure(
      result,
      'rpc_error',
      'Transmission rejected torrent submission: duplicate torrent.',
    );
  });

  it('returns a structured failure when the server responds with a non-OK status after negotiation', async () => {
    const server = startTransmissionServer((request) => {
      const sessionId = request.headers.get('x-transmission-session-id');

      if (!sessionId) {
        return new Response(null, {
          status: 409,
          headers: {
            'x-transmission-session-id': 'session-123',
          },
        });
      }

      return new Response('upstream unavailable', {
        status: 503,
      });
    });
    const downloader = createTransmissionDownloader(
      createTransmissionConfig(server.url.origin),
    );

    const result = await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
    });

    expectFailure(
      result,
      'http_error',
      'Transmission RPC request failed with HTTP 503.',
    );
  });

  it('returns a structured failure when session negotiation omits the session id header', async () => {
    const server = startTransmissionServer(
      () =>
        new Response(null, {
          status: 409,
        }),
    );
    const downloader = createTransmissionDownloader(
      createTransmissionConfig(server.url.origin),
    );

    const result = await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
    });

    expectFailure(
      result,
      'session_error',
      'Transmission session negotiation failed: missing X-Transmission-Session-Id header.',
    );
  });

  it('returns a structured failure when the response body is not valid JSON', async () => {
    const server = startTransmissionServer((request) => {
      const sessionId = request.headers.get('x-transmission-session-id');

      if (!sessionId) {
        return new Response(null, {
          status: 409,
          headers: {
            'x-transmission-session-id': 'session-123',
          },
        });
      }

      return new Response('not-json', {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    });
    const downloader = createTransmissionDownloader(
      createTransmissionConfig(server.url.origin),
    );

    const result = await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
    });

    expectFailure(
      result,
      'invalid_response',
      'Transmission RPC response was not valid JSON.',
    );
  });

  it('returns a structured failure when fetch throws before any response is returned', async () => {
    globalThis.fetch = Object.assign(
      async () => {
        throw new Error('connect ECONNREFUSED');
      },
      {
        preconnect: originalFetch.preconnect.bind(originalFetch),
      },
    );

    const downloader = createTransmissionDownloader(
      createTransmissionConfig('http://127.0.0.1:65535'),
    );

    const result = await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
    });

    expectFailure(
      result,
      'network_error',
      'Transmission RPC request failed: connect ECONNREFUSED.',
    );
  });
});

function startTransmissionServer(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/transmission/rpc': handler,
    },
  });

  servers.push(server);
  return server;
}

function createTransmissionConfig(
  origin: string,
  downloadDir?: string,
): TransmissionConfig {
  return {
    url: `${origin}/transmission/rpc`,
    username: 'pirate',
    password: 'claw',
    downloadDir,
  };
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function captureRequest(request: Request): Promise<CapturedRequest> {
  const text = await request.text();

  return {
    authorization: request.headers.get('authorization'),
    sessionId: request.headers.get('x-transmission-session-id'),
    contentType: request.headers.get('content-type'),
    json: text.length > 0 ? JSON.parse(text) : undefined,
  };
}

type CapturedRequest = {
  authorization: string | null;
  sessionId: string | null;
  contentType: string | null;
  json: unknown;
};

function expectFailure(
  result: unknown,
  code: SubmissionFailureCode,
  message: string,
): asserts result is SubmissionFailure {
  expect(result).toEqual({
    ok: false,
    code,
    message,
  });
}
