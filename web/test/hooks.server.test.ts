// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init, handle, resolveUnauthenticatedPageRedirect } from '../src/hooks.server';
import {
	getSessionSecret,
	initSessionSecret,
	signJwt,
	SESSION_COOKIE_NAME
} from '../src/lib/server/session';
import { apiRequest } from '../src/lib/server/api';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('../src/lib/server/api', () => ({
	apiRequest: vi.fn()
}));

const savedEnv: Record<string, string | undefined> = {};
let tmpDir: string;
let tokenFile: string;
let secretFile: string;

beforeEach(() => {
	savedEnv.PIRATE_CLAW_API_WRITE_TOKEN = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	savedEnv.PIRATE_CLAW_DAEMON_TOKEN_FILE = process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	savedEnv.PIRATE_CLAW_SESSION_SECRET = process.env.PIRATE_CLAW_SESSION_SECRET;
	savedEnv.PIRATE_CLAW_SESSION_SECRET_FILE = process.env.PIRATE_CLAW_SESSION_SECRET_FILE;
	delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	delete process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	delete process.env.PIRATE_CLAW_SESSION_SECRET;
	delete process.env.PIRATE_CLAW_SESSION_SECRET_FILE;
	vi.mocked(apiRequest).mockReset();
	// reset module-level secret before each test
	initSessionSecret('');
	tmpDir = mkdtempSync(join(tmpdir(), 'pc-hook-test-'));
	tokenFile = join(tmpDir, 'daemon-api-write-token');
	secretFile = join(tmpDir, 'session-secret');
});

afterEach(() => {
	const keys = [
		'PIRATE_CLAW_API_WRITE_TOKEN',
		'PIRATE_CLAW_DAEMON_TOKEN_FILE',
		'PIRATE_CLAW_SESSION_SECRET',
		'PIRATE_CLAW_SESSION_SECRET_FILE'
	] as const;
	for (const key of keys) {
		if (savedEnv[key] !== undefined) {
			process.env[key] = savedEnv[key];
		} else {
			delete process.env[key];
		}
	}
	rmSync(tmpDir, { recursive: true, force: true });
});

describe('hooks.server init — write token', () => {
	it('reads token from file when PIRATE_CLAW_DAEMON_TOKEN_FILE is set', () => {
		writeFileSync(tokenFile, 'test-token-from-file\n');
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = tokenFile;

		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBe('test-token-from-file');
	});

	it('does not overwrite an already-set PIRATE_CLAW_API_WRITE_TOKEN', () => {
		process.env.PIRATE_CLAW_API_WRITE_TOKEN = 'already-set';
		writeFileSync(tokenFile, 'file-token');
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = tokenFile;

		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBe('already-set');
	});

	it('does nothing when neither env var is set', () => {
		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBeUndefined();
	});

	it('does nothing when token file does not exist', () => {
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = join(tmpDir, 'nonexistent');

		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBeUndefined();
	});

	it('does nothing when token file is empty', () => {
		writeFileSync(tokenFile, '   \n');
		process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE = tokenFile;

		init();

		expect(process.env.PIRATE_CLAW_API_WRITE_TOKEN).toBeUndefined();
	});
});

describe('hooks.server init — session secret', () => {
	it('reads secret from PIRATE_CLAW_SESSION_SECRET env var', () => {
		process.env.PIRATE_CLAW_SESSION_SECRET = 'direct-secret';

		init();

		expect(getSessionSecret()).toBe('direct-secret');
	});

	it('reads secret from file when PIRATE_CLAW_SESSION_SECRET_FILE is set', () => {
		writeFileSync(secretFile, 'file-secret\n');
		process.env.PIRATE_CLAW_SESSION_SECRET_FILE = secretFile;

		init();

		expect(getSessionSecret()).toBe('file-secret');
	});

	it('prefers PIRATE_CLAW_SESSION_SECRET over file', () => {
		process.env.PIRATE_CLAW_SESSION_SECRET = 'env-secret';
		writeFileSync(secretFile, 'file-secret');
		process.env.PIRATE_CLAW_SESSION_SECRET_FILE = secretFile;

		init();

		expect(getSessionSecret()).toBe('env-secret');
	});

	it('does nothing when no secret env vars are set', () => {
		init();

		expect(getSessionSecret()).toBeFalsy();
	});

	it('does nothing when secret file does not exist', () => {
		process.env.PIRATE_CLAW_SESSION_SECRET_FILE = join(tmpDir, 'nonexistent');

		init();

		expect(getSessionSecret()).toBeFalsy();
	});
});

describe('handle — public paths still resolve locals.user from a valid session', () => {
	beforeEach(() => {
		initSessionSecret('test-secret');
	});

	function fakeEvent(path: string, cookieValue: string | undefined): RequestEvent {
		return {
			url: new URL(`http://localhost:8888${path}`),
			cookies: { get: (name: string) => (name === SESSION_COOKIE_NAME ? cookieValue : undefined) },
			locals: {}
		} as unknown as RequestEvent;
	}

	it('populates locals.user on /login when a valid session cookie is present', async () => {
		const token = await signJwt('pirate-claw-admin', 'test-secret');
		const event = fakeEvent('/login', token);
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		await handle({ event, resolve } as never);

		expect(event.locals.user).toEqual({ username: 'pirate-claw-admin' });
		expect(resolve).toHaveBeenCalledWith(event);
	});

	it('leaves locals.user null on /login with no session cookie', async () => {
		const event = fakeEvent('/login', undefined);
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		await handle({ event, resolve } as never);

		expect(event.locals.user).toBeNull();
		expect(resolve).toHaveBeenCalledWith(event);
	});

	it('populates locals.user on /setup when a valid session cookie is present', async () => {
		const token = await signJwt('pirate-claw-admin', 'test-secret');
		const event = fakeEvent('/setup', token);
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		await handle({ event, resolve } as never);

		expect(event.locals.user).toEqual({ username: 'pirate-claw-admin' });
		expect(resolve).toHaveBeenCalledWith(event);
	});

	it('still resolves a protected path for an authenticated user', async () => {
		const token = await signJwt('pirate-claw-admin', 'test-secret');
		const event = fakeEvent('/', token);
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		await handle({ event, resolve } as never);

		expect(event.locals.user).toEqual({ username: 'pirate-claw-admin' });
		expect(resolve).toHaveBeenCalledWith(event);
	});
});

describe('resolveUnauthenticatedPageRedirect', () => {
	it('returns /setup when daemon auth state says no owner exists', async () => {
		vi.mocked(apiRequest).mockResolvedValue(
			new Response(JSON.stringify({ owner_exists: false }), { status: 200 })
		);

		await expect(resolveUnauthenticatedPageRedirect('write-token')).resolves.toBe('/setup');
	});

	it('returns /login when daemon auth state says owner exists', async () => {
		vi.mocked(apiRequest).mockResolvedValue(
			new Response(JSON.stringify({ owner_exists: true }), { status: 200 })
		);

		await expect(resolveUnauthenticatedPageRedirect('write-token')).resolves.toBe('/login');
	});

	it('returns /login when daemon auth state cannot be reached', async () => {
		vi.mocked(apiRequest).mockRejectedValue(new Error('offline'));

		await expect(resolveUnauthenticatedPageRedirect('write-token')).resolves.toBe('/login');
	});
});
