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

  it('submits queue-time labels when provided', async () => {
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
      labels: ['movie'],
    });

    expect(result.ok).toBe(true);
    expect(requests[1]!.json).toEqual({
      method: 'torrent-add',
      arguments: {
        filename: 'https://download.example.test/movie/example.torrent',
        'download-dir': '/downloads/movies',
        labels: ['movie'],
      },
    });
  });

  it('retries without labels when Transmission rejects label arguments', async () => {
    const requests: CapturedRequest[] = [];
    let requestCount = 0;
    const warnings: string[] = [];
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

      const body = requests.at(-1)?.json as {
        arguments?: { labels?: string[] };
      };

      if (body.arguments?.labels) {
        return Response.json({
          result: 'invalid or unknown argument: labels',
          arguments: {},
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
      {
        warn: (message) => warnings.push(message),
      },
    );

    const result = await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
      labels: ['movie'],
    });

    expect(result).toEqual({
      ok: true,
      status: 'queued',
      torrentId: 7,
      torrentName: 'Example Movie',
      torrentHash: 'abcdef123456',
    });
    expect(warnings).toEqual([
      'Transmission rejected label arguments; retrying submission without labels.',
    ]);
    expect(requests).toHaveLength(3);
    expect(requests[1]!.json).toEqual({
      method: 'torrent-add',
      arguments: {
        filename: 'https://download.example.test/movie/example.torrent',
        'download-dir': '/downloads/movies',
        labels: ['movie'],
      },
    });
    expect(requests[2]!.json).toEqual({
      method: 'torrent-add',
      arguments: {
        filename: 'https://download.example.test/movie/example.torrent',
        'download-dir': '/downloads/movies',
      },
    });
  });

  it('returns the original structured failure when label fallback also fails', async () => {
    let requestCount = 0;
    const warnings: string[] = [];
    const server = startTransmissionServer(async (request) => {
      requestCount += 1;

      if (requestCount === 1) {
        return new Response(null, {
          status: 409,
          headers: {
            'x-transmission-session-id': 'session-123',
          },
        });
      }

      const body = (await request.json()) as {
        arguments?: { labels?: string[] };
      };

      if (body.arguments?.labels) {
        return Response.json({
          result: 'invalid or unknown argument: labels',
          arguments: {},
        });
      }

      return Response.json({
        result: 'torrent rejected by policy',
        arguments: {},
      });
    });
    const downloader = createTransmissionDownloader(
      createTransmissionConfig(server.url.origin),
      {
        warn: (message) => warnings.push(message),
      },
    );

    const result = await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
      labels: ['movie'],
    });

    expectFailure(
      result,
      'rpc_error',
      'Transmission rejected torrent submission: torrent rejected by policy.',
      'torrent rejected by policy',
    );
    expect(warnings).toEqual([
      'Transmission rejected label arguments; retrying submission without labels.',
    ]);
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

  it('returns a structured failure when a success response omits torrent details', async () => {
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
        result: 'success',
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
      'invalid_response',
      'Transmission RPC success response was missing torrent details.',
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

  it('prefers per-submission downloadDir over config downloadDir', async () => {
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
      createTransmissionConfig(server.url.origin, '/downloads/default'),
    );

    await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
      downloadDir: '/downloads/movies',
    });

    expect(requests[1]!.json).toEqual({
      method: 'torrent-add',
      arguments: {
        filename: 'https://download.example.test/movie/example.torrent',
        'download-dir': '/downloads/movies',
      },
    });
  });

  it('falls back to config downloadDir when per-submission downloadDir is omitted', async () => {
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
      createTransmissionConfig(server.url.origin, '/downloads/default'),
    );

    await downloader.submit({
      downloadUrl: 'https://download.example.test/movie/example.torrent',
    });

    expect(requests[1]!.json).toEqual({
      method: 'torrent-add',
      arguments: {
        filename: 'https://download.example.test/movie/example.torrent',
        'download-dir': '/downloads/default',
      },
    });
  });

  it('looks up torrent lifecycle details through torrent-get', async () => {
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
          torrents: [
            {
              id: 42,
              hashString: 'hash-42',
              name: 'Queued Torrent',
              status: 4,
              percentDone: 0.5,
              doneDate: 0,
              downloadDir: '/downloads/movies',
            },
          ],
        },
      });
    });
    const downloader = createTransmissionDownloader(
      createTransmissionConfig(server.url.origin),
    );

    const result = await downloader.lookupTorrents!({
      ids: [42],
      hashes: ['hash-42'],
    });

    expect(result).toEqual({
      ok: true,
      torrents: [
        {
          torrentId: 42,
          torrentHash: 'hash-42',
          torrentName: 'Queued Torrent',
          statusCode: 4,
          percentDone: 0.5,
          doneDate: undefined,
          downloadDir: '/downloads/movies',
        },
      ],
    });
    expect(requests[1]!.json).toEqual({
      method: 'torrent-get',
      arguments: {
        ids: [42, 'hash-42'],
        fields: [
          'id',
          'name',
          'hashString',
          'status',
          'percentDone',
          'doneDate',
          'downloadDir',
        ],
      },
    });
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
  rpcResult?: string,
): asserts result is SubmissionFailure {
  expect(result).toEqual(
    expect.objectContaining({
      ok: false,
      code,
      message,
      ...(rpcResult ? { rpcResult } : {}),
    }),
  );
}
