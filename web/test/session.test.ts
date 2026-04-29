// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
	signJwt,
	verifyJwt,
	issueSessionCookie,
	clearSessionCookie,
	SESSION_COOKIE_NAME
} from '../src/lib/server/session';

const TEST_SECRET = 'test-secret-value-for-unit-tests';

describe('session JWT', () => {
	it('signs and verifies a valid token', async () => {
		const token = await signJwt('alice', TEST_SECRET);
		const result = await verifyJwt(token, TEST_SECRET);
		expect(result).toEqual({ username: 'alice' });
	});

	it('returns null for a tampered signature', async () => {
		const token = await signJwt('alice', TEST_SECRET);
		const parts = token.split('.');
		parts[2] = parts[2].slice(0, -4) + 'AAAA';
		const result = await verifyJwt(parts.join('.'), TEST_SECRET);
		expect(result).toBeNull();
	});

	it('returns null for wrong secret', async () => {
		const token = await signJwt('alice', TEST_SECRET);
		const result = await verifyJwt(token, 'wrong-secret');
		expect(result).toBeNull();
	});

	it('returns null for expired token', async () => {
		const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		const past = Math.floor(Date.now() / 1000) - 1;
		const payload = btoa(JSON.stringify({ sub: 'alice', iat: past - 100, exp: past }))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		const data = `${header}.${payload}`;
		const enc = new TextEncoder();
		const key = await crypto.subtle.importKey(
			'raw',
			enc.encode(TEST_SECRET),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
		const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		const expired = `${data}.${sigB64}`;
		const result = await verifyJwt(expired, TEST_SECRET);
		expect(result).toBeNull();
	});

	it('returns null for malformed token', async () => {
		expect(await verifyJwt('not.a.valid.jwt.here', TEST_SECRET)).toBeNull();
		expect(await verifyJwt('', TEST_SECRET)).toBeNull();
	});
});

describe('session cookies', () => {
	it('issues cookie with correct attributes', () => {
		const setCalls: Array<Parameters<ReturnType<typeof makeCookies>['set']>> = [];
		const cookies = makeCookies(setCalls);
		issueSessionCookie(cookies, 'tok');
		expect(setCalls).toHaveLength(1);
		const [name, value, opts] = setCalls[0];
		expect(name).toBe(SESSION_COOKIE_NAME);
		expect(value).toBe('tok');
		expect(opts?.httpOnly).toBe(true);
		expect(opts?.sameSite).toBe('strict');
		expect(opts?.path).toBe('/');
		expect(opts?.maxAge).toBeGreaterThan(0);
	});

	it('clears cookie by deleting it', () => {
		const deleteCalls: DeleteArgs[] = [];
		const cookies = makeCookies([], deleteCalls);
		clearSessionCookie(cookies);
		expect(deleteCalls).toHaveLength(1);
		expect(deleteCalls[0][0]).toBe(SESSION_COOKIE_NAME);
	});
});

type SetArgs = Parameters<import('@sveltejs/kit').Cookies['set']>;
type DeleteArgs = [string, Parameters<import('@sveltejs/kit').Cookies['delete']>[1]?];

function makeCookies(
	setCalls: SetArgs[] = [],
	deleteCalls: DeleteArgs[] = []
): import('@sveltejs/kit').Cookies {
	return {
		get: vi.fn(),
		getAll: vi.fn(),
		set: (...args: SetArgs) => {
			setCalls.push(args);
		},
		delete: (name: string, opts?: Parameters<import('@sveltejs/kit').Cookies['delete']>[1]) => {
			deleteCalls.push([name, opts]);
		},
		serialize: vi.fn()
	};
}
