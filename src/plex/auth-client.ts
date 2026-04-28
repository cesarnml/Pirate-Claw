import { sign } from 'node:crypto';

import type { PlexAuthIdentity } from './auth';

const PLEX_CLIENTS_API = 'https://clients.plex.tv';
const PLEX_HOSTED_AUTH_BASE = 'https://app.plex.tv/auth#?';
const PLEX_AUTH_SCOPE = 'username,email,friendly_name';

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
  const response = await fetch(`${PLEX_CLIENTS_API}/api/v2/pins`, {
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
  });

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

const PIN_POLL_ATTEMPTS = 4;
const PIN_POLL_DELAY_MS = 600;

export async function exchangePlexPinForAuthToken(input: {
  clientIdentifier: string;
  pinId: number;
}): Promise<string | null> {
  // Plex redirects to forwardUrl before the PIN is committed server-side.
  // Poll a few times with a short delay to give Plex time to finalize.
  for (let attempt = 0; attempt < PIN_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, PIN_POLL_DELAY_MS));
    }

    const response = await fetch(
      `${PLEX_CLIENTS_API}/api/v2/pins/${String(input.pinId)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Plex-Client-Identifier': input.clientIdentifier,
        },
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Plex PIN exchange failed with HTTP ${response.status}. ${text}`,
      );
    }

    const body = (await response.json()) as { authToken?: string | null };
    if (body.authToken) {
      return body.authToken;
    }
  }

  return null;
}

export async function refreshPlexAuthToken(input: {
  clientIdentifier: string;
  identity: PlexAuthIdentity;
  now?: Date;
}): Promise<string> {
  const nonceResponse = await fetch(`${PLEX_CLIENTS_API}/api/v2/auth/nonce`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Plex-Client-Identifier': input.clientIdentifier,
    },
  });

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

  const tokenResponse = await fetch(`${PLEX_CLIENTS_API}/api/v2/auth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Plex-Client-Identifier': input.clientIdentifier,
    },
    body: JSON.stringify({ jwt: deviceJwt }),
  });

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
  //
  // Plex's hosted auth page reads every context[device][*] param and forwards
  // them as X-Plex-* headers on its PUT /api/v2/pins/link call. Missing params
  // become the literal string "undefined" in those headers, causing a 403.
  const parts = [
    `clientID=${encodeURIComponent(input.clientIdentifier)}`,
    `code=${encodeURIComponent(input.pinCode)}`,
    `context[device][product]=${encodeURIComponent(input.productName)}`,
    `context[device][device]=${encodeURIComponent(input.productName)}`,
    `context[device][deviceName]=${encodeURIComponent(input.productName)}`,
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
