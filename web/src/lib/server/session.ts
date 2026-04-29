import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE_NAME = 'pc_session';
const JWT_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

let _sessionSecret: string | null = null;

export function initSessionSecret(secret: string): void {
	_sessionSecret = secret;
}

export function getSessionSecret(): string | null {
	return _sessionSecret;
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
	const arr = ArrayBuffer.isView(buf) ? (buf as Uint8Array) : new Uint8Array(buf);
	return btoa(String.fromCharCode(...arr))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
	const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(base64);
	return new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	const enc = new TextEncoder();
	return crypto.subtle.importKey(
		'raw',
		enc.encode(secret).buffer as ArrayBuffer,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

export async function signJwt(username: string, secret: string): Promise<string> {
	const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
	const now = Math.floor(Date.now() / 1000);
	const payload = b64url(
		new TextEncoder().encode(
			JSON.stringify({ sub: username, iat: now, exp: now + JWT_EXPIRY_SECONDS })
		)
	);
	const data = `${header}.${payload}`;
	const key = await hmacKey(secret);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
	return `${data}.${b64url(sig)}`;
}

export async function verifyJwt(
	token: string,
	secret: string
): Promise<{ username: string } | null> {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [header, payload, sigB64] = parts;
	const data = `${header}.${payload}`;
	const key = await hmacKey(secret);
	const sigBytes = b64urlDecode(sigB64);
	const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
	if (!valid) return null;
	let claims: { sub?: unknown; exp?: unknown };
	try {
		claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as {
			sub?: unknown;
			exp?: unknown;
		};
	} catch {
		return null;
	}
	if (typeof claims.sub !== 'string') return null;
	if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
	return { username: claims.sub };
}

export function issueSessionCookie(cookies: Cookies, token: string): void {
	cookies.set(SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: 'strict',
		secure: false,
		path: '/',
		maxAge: JWT_EXPIRY_SECONDS
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}
