import { sign } from 'node:crypto';

import { loggedFetch } from '../http-log';
import type { PlexAuthIdentity } from './auth';

const PLEX_CLIENTS_API = 'https://clients.plex.tv';
const PLEX_HOSTED_AUTH_BASE = 'https://app.plex.tv/auth#?';
const PLEX_AUTH_SCOPE = 'username,email,friendly_name';
const PLEX_DEVICE_SCREEN_RESOLUTION = '1920x1080';

export type StartPlexPinAuthInput = {
  clientIdentifier: string;
  productName: string;
  forwardUrl: string;
  jwk: Record<string, unknown>;
};

export type StartedPlexPinAuth = {
  pinId: number;
  pinCode: string;
  expiresAt: string;
  authUrl: string;
};

export async function startPlexPinAuth(
  input: StartPlexPinAuthInput,
): Promise<StartedPlexPinAuth> {
  const response = await loggedFetch(
    `${PLEX_CLIENTS_API}/api/v2/pins`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Plex-Client-Identifier': input.clientIdentifier,
        'X-Plex-Product': input.productName,
        'X-Plex-Version': '1.0.0',
        'X-Plex-Platform': 'Web',
        'X-Plex-Device': input.productName,
        'X-Plex-Device-Name': input.productName,
      },
      body: JSON.stringify({ strong: true, jwk: input.jwk }),
    },
    { source: 'plex-auth', label: 'pin-start' },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Plex PIN start failed with HTTP ${response.status}. ${text}`,
    );
  }

  const body = (await response.json()) as {
    id?: number;
    code?: string;
    expiresIn?: number;
  };

  if (!body.id || !body.code || !body.expiresIn) {
    throw new Error('Plex PIN start returned an incomplete response.');
  }

  const authUrl = buildPlexHostedAuthUrl({
    clientIdentifier: input.clientIdentifier,
    pinCode: body.code,
    productName: input.productName,
    forwardUrl: input.forwardUrl,
  });

  return {
    pinId: body.id,
    pinCode: body.code,
    expiresAt: new Date(Date.now() + body.expiresIn * 1000).toISOString(),
    authUrl,
  };
}

/** Thrown when Plex's PIN endpoint returns HTTP 429. Carries the wait Plex asked for. */
export class PlexRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Plex PIN exchange was rate limited; retry after ${retryAfterMs}ms.`);
    this.name = 'PlexRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

const DEFAULT_RATE_LIMIT_RETRY_MS = 5_000;

// Plex redirects to forwardUrl before the PIN is committed server-side, so a
// single check can legitimately see it not-yet-linked. That's expected and
// signaled by returning null — the caller's own poll loop (the browser
// reloading the callback page) is what retries, not this function. A prior
// version also looped here (up to 20x, 1s apart) *inside* every call, which
// multiplied against the browser's reload cadence and was enough to trip
// Plex's rate limit (see docs/synology-runbook.md "Plex PIN exchange 429").
export async function exchangePlexPinForAuthToken(input: {
  clientIdentifier: string;
  pinId: number;
}): Promise<string | null> {
  console.log(`[plex-auth] pin exchange check pinId=${input.pinId}`);

  const response = await loggedFetch(
    `${PLEX_CLIENTS_API}/api/v2/pins/${String(input.pinId)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Plex-Client-Identifier': input.clientIdentifier,
      },
    },
    { source: 'plex-auth', label: 'pin-exchange' },
  );

  if (response.status === 429) {
    const retryAfterRaw = response.headers.get('retry-after');
    const retryAfterSec = retryAfterRaw !== null ? Number(retryAfterRaw) : NaN;
    const retryAfterMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : DEFAULT_RATE_LIMIT_RETRY_MS;
    console.warn(
      `[plex-auth] pin exchange rate limited (429) pinId=${input.pinId} retryAfterMs=${retryAfterMs}`,
    );
    throw new PlexRateLimitError(retryAfterMs);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(
      `[plex-auth] pin exchange failed pinId=${input.pinId} status=${response.status}`,
    );
    throw new Error(
      `Plex PIN exchange failed with HTTP ${response.status}. ${text}`,
    );
  }

  const body = (await response.json()) as { authToken?: string | null };
  if (body.authToken) {
    console.log(`[plex-auth] pin exchange linked pinId=${input.pinId}`);
    return body.authToken;
  }

  console.log(`[plex-auth] pin exchange still pending pinId=${input.pinId}`);
  return null;
}

export async function refreshPlexAuthToken(input: {
  clientIdentifier: string;
  identity: PlexAuthIdentity;
  now?: Date;
}): Promise<string> {
  const nonceResponse = await loggedFetch(
    `${PLEX_CLIENTS_API}/api/v2/auth/nonce`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Plex-Client-Identifier': input.clientIdentifier,
      },
    },
    { source: 'plex-auth', label: 'nonce' },
  );

  if (!nonceResponse.ok) {
    throw new Error(
      `Plex nonce request failed with HTTP ${nonceResponse.status}.`,
    );
  }

  const nonceBody = (await nonceResponse.json()) as { nonce?: string };
  if (!nonceBody.nonce) {
    throw new Error('Plex nonce response did not include a nonce.');
  }

  const deviceJwt = createDeviceJwt({
    clientIdentifier: input.clientIdentifier,
    keyId: input.identity.keyId,
    privateKeyPem: input.identity.privateKeyPem,
    nonce: nonceBody.nonce,
    now: input.now,
  });

  const tokenResponse = await loggedFetch(
    `${PLEX_CLIENTS_API}/api/v2/auth/token`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Plex-Client-Identifier': input.clientIdentifier,
      },
      body: JSON.stringify({ jwt: deviceJwt }),
    },
    { source: 'plex-auth', label: 'token-refresh' },
  );

  if (!tokenResponse.ok) {
    throw new Error(
      `Plex token refresh failed with HTTP ${tokenResponse.status}.`,
    );
  }

  const tokenBody = (await tokenResponse.json()) as {
    auth_token?: string;
    authToken?: string;
  };
  const authToken = tokenBody.auth_token ?? tokenBody.authToken;
  if (!authToken) {
    throw new Error('Plex token refresh response did not include auth_token.');
  }

  return authToken;
}

function buildPlexHostedAuthUrl(input: {
  clientIdentifier: string;
  pinCode: string;
  productName: string;
  forwardUrl: string;
}): string {
  // URLSearchParams percent-encodes [ and ], which breaks Plex's PHP-style
  // nested param parsing for context[device][*]. Build the fragment manually.
  const parts = [
    `clientID=${encodeURIComponent(input.clientIdentifier)}`,
    `code=${encodeURIComponent(input.pinCode)}`,
    `context[device][product]=${encodeURIComponent(input.productName)}`,
    `context[device][device]=${encodeURIComponent(input.productName)}`,
    `context[device][deviceName]=${encodeURIComponent(input.productName)}`,
    `context[device][screenResolution]=${encodeURIComponent(PLEX_DEVICE_SCREEN_RESOLUTION)}`,
    `context[device][platform]=Web`,
    `context[device][platformVersion]=1.0.0`,
    `context[device][version]=1.0.0`,
    `forwardUrl=${encodeURIComponent(input.forwardUrl)}`,
  ];
  return `${PLEX_HOSTED_AUTH_BASE}${parts.join('&')}`;
}

function createDeviceJwt(input: {
  clientIdentifier: string;
  keyId: string;
  privateKeyPem: string;
  nonce?: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + 300;
  const header = {
    kid: input.keyId,
    alg: 'EdDSA',
    typ: 'JWT',
  };
  const payload = {
    ...(input.nonce ? { nonce: input.nonce } : {}),
    aud: 'plex.tv',
    iss: input.clientIdentifier,
    scope: PLEX_AUTH_SCOPE,
    iat: issuedAt,
    exp: expiresAt,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(
    null,
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    input.privateKeyPem,
  );

  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
