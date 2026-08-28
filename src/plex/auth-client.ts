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

function parseRetryAfterMs(response: Response): number {
  const retryAfterRaw = response.headers.get('retry-after');
  const retryAfterSec = retryAfterRaw !== null ? Number(retryAfterRaw) : NaN;
  return Number.isFinite(retryAfterSec) && retryAfterSec > 0
    ? retryAfterSec * 1000
    : DEFAULT_RATE_LIMIT_RETRY_MS;
}

/** Shared by every clients.plex.tv call site that can 429 (pin exchange,
 * nonce, token refresh, devices exchange) so each honors Plex's Retry-After
 * the same way — throws PlexRateLimitError if `response` is a 429, otherwise
 * does nothing. */
function throwIfRateLimited(response: Response, label: string): void {
  if (response.status !== 429) {
    return;
  }
  const retryAfterMs = parseRetryAfterMs(response);
  console.warn(
    `[plex-auth] ${label} rate limited (429) retryAfterMs=${retryAfterMs}`,
  );
  throw new PlexRateLimitError(retryAfterMs);
}

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

  throwIfRateLimited(response, `pin exchange pinId=${input.pinId}`);

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
    // The PIN was created with strong: true (see startPlexPinAuth), which
    // asks Plex for a JWT-capable link — the token this endpoint hands back
    // is plex.tv-scoped, same as /api/v2/auth/token's, and needs the same
    // /api/v2/devices exchange before it's usable as a PMS X-Plex-Token
    // (see refreshPlexAuthToken()).
    try {
      return await exchangeJwtForLegacyToken({
        clientIdentifier: input.clientIdentifier,
        jwtToken: body.authToken,
      });
    } catch (error) {
      if (error instanceof PlexRateLimitError) {
        throw error;
      }
      // Plex just linked the PIN, but /api/v2/devices may not have
      // propagated this device yet — treat like the not-yet-linked case
      // (return null, let the callback page's own retry/timeout handle it)
      // rather than a hard failure, so a brief propagation lag doesn't force
      // the user to restart the whole sign-in.
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[plex-auth] pin linked but devices exchange not ready yet pinId=${input.pinId}: ${message}`,
      );
      return null;
    }
  }

  console.log(`[plex-auth] pin exchange still pending pinId=${input.pinId}`);
  return null;
}

export async function refreshPlexAuthToken(input: {
  clientIdentifier: string;
  identity: PlexAuthIdentity;
  now?: Date;
}): Promise<string> {
  console.log(
    `[plex-auth] silent renewal starting clientIdentifier=${input.clientIdentifier}`,
  );

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

  throwIfRateLimited(nonceResponse, 'nonce request');

  if (!nonceResponse.ok) {
    console.error(
      `[plex-auth] nonce request failed status=${nonceResponse.status}`,
    );
    throw new Error(
      `Plex nonce request failed with HTTP ${nonceResponse.status}.`,
    );
  }

  const nonceBody = (await nonceResponse.json()) as { nonce?: string };
  if (!nonceBody.nonce) {
    console.error('[plex-auth] nonce response missing nonce field');
    throw new Error('Plex nonce response did not include a nonce.');
  }
  console.log('[plex-auth] nonce received, signing device JWT');

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

  throwIfRateLimited(tokenResponse, 'token refresh');

  if (!tokenResponse.ok) {
    console.error(
      `[plex-auth] token refresh failed status=${tokenResponse.status}`,
    );
    throw new Error(
      `Plex token refresh failed with HTTP ${tokenResponse.status}.`,
    );
  }

  const tokenBody = (await tokenResponse.json()) as {
    auth_token?: string;
    authToken?: string;
  };
  const jwtToken = tokenBody.auth_token ?? tokenBody.authToken;
  if (!jwtToken) {
    console.error('[plex-auth] token refresh response missing auth_token');
    throw new Error('Plex token refresh response did not include auth_token.');
  }
  console.log(
    '[plex-auth] plex.tv-scoped token minted, exchanging for legacy PMS token',
  );

  // /api/v2/auth/token returns a JWT scoped to plex.tv's own API — Plex
  // Media Server does not understand JWTs and rejects them with 401
  // (confirmed against the live PMS on this box: a fresh JWT 401s at
  // /library/sections every time, no matter how recently it was minted).
  // /api/v2/devices, called with that same JWT, lists every device linked
  // to the account and gives each one back a legacy ~20-char token that PMS
  // does accept — that's the token this function must actually return.
  const legacyToken = await exchangeJwtForLegacyToken({
    clientIdentifier: input.clientIdentifier,
    jwtToken,
  });
  console.log('[plex-auth] silent renewal complete, legacy token obtained');
  return legacyToken;
}

/**
 * Exchanges a plex.tv-scoped JWT for this device's legacy PMS-compatible
 * token via GET /api/v2/devices. See the comment in refreshPlexAuthToken()
 * for why this step exists.
 */
async function exchangeJwtForLegacyToken(input: {
  clientIdentifier: string;
  jwtToken: string;
}): Promise<string> {
  console.log(
    `[plex-auth] devices exchange starting clientIdentifier=${input.clientIdentifier}`,
  );

  const response = await loggedFetch(
    `${PLEX_CLIENTS_API}/api/v2/devices`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Plex-Client-Identifier': input.clientIdentifier,
        'X-Plex-Token': input.jwtToken,
      },
    },
    { source: 'plex-auth', label: 'devices-exchange' },
  );

  throwIfRateLimited(response, 'devices exchange');

  if (!response.ok) {
    console.error(
      `[plex-auth] devices exchange failed status=${response.status}`,
    );
    throw new Error(`Plex devices lookup failed with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as unknown;
  const devices = Array.isArray(body) ? body : [body];
  console.log(
    `[plex-auth] devices exchange returned ${devices.length} device(s)`,
  );

  const mine = devices.find(
    (d): d is { clientIdentifier?: string; token?: string } =>
      typeof d === 'object' &&
      d !== null &&
      (d as { clientIdentifier?: unknown }).clientIdentifier ===
        input.clientIdentifier,
  );

  if (!mine?.token) {
    console.error(
      `[plex-auth] no device in the response matched clientIdentifier=${input.clientIdentifier}`,
    );
    throw new Error(
      'Plex devices response did not include a legacy token for this device.',
    );
  }

  console.log(
    `[plex-auth] devices exchange matched this device, legacy token length=${mine.token.length}`,
  );
  return mine.token;
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
