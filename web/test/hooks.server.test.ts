// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init, resolveUnauthenticatedPageRedirect, handle } from '../src/hooks.server';
import { getSessionSecret, initSessionSecret } from '../src/lib/server/session';
import { apiRequest } from '../src/lib/server/api';

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

describe('handle — CSRF validation', () => {
	const savedOrigin = process.env.ORIGIN;
	let trustedOriginsFile: string;

	beforeEach(() => {
		process.env.ORIGIN = 'http://localhost';
		trustedOriginsFile = join(tmpDir, 'trusted-origins.json');
		delete process.env.PIRATE_CLAW_TRUSTED_ORIGINS_FILE;
		initSessionSecret('');
		vi.mocked(apiRequest).mockReset();
	});

	afterEach(() => {
		if (savedOrigin !== undefined) {
			process.env.ORIGIN = savedOrigin;
		} else {
			delete process.env.ORIGIN;
		}
		delete process.env.PIRATE_CLAW_TRUSTED_ORIGINS_FILE;
	});

	function makeFormEvent(origin: string, pathname = '/setup') {
		return {
			request: new Request(`http://localhost${pathname}`, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					origin
				},
				body: 'field=value'
			}),
			url: new URL(`http://localhost${pathname}`),
			cookies: { get: vi.fn().mockReturnValue(undefined) },
			locals: {} as App.Locals
		};
	}

	it('rejects form POST from unknown secondary origin (current broken state — CSRF not enforced)', async () => {
		const event = makeFormEvent('http://100.64.0.1');
		const resolve = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

		const response = await handle({ event: event as never, resolve });

		expect(response.status).toBe(403);
	});

	it('allows form POST from secondary origin when it is in trusted-origins', async () => {
		writeFileSync(trustedOriginsFile, JSON.stringify(['http://100.64.0.1']));
		process.env.PIRATE_CLAW_TRUSTED_ORIGINS_FILE = trustedOriginsFile;
		init();

		const event = makeFormEvent('http://100.64.0.1');
		const resolve = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

		const response = await handle({ event: event as never, resolve });

		expect(response.status).not.toBe(403);
	});

	it('allows form POST from same-origin (ORIGIN env)', async () => {
		const event = makeFormEvent('http://localhost');
		const resolve = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

		const response = await handle({ event: event as never, resolve });

		expect(response.status).not.toBe(403);
	});

	it('allows GET requests from any origin without CSRF check', async () => {
		const event = {
			request: new Request('http://localhost/', {
				method: 'GET',
				headers: { origin: 'http://100.64.0.1' }
			}),
			url: new URL('http://localhost/'),
			cookies: { get: vi.fn().mockReturnValue(undefined) },
			locals: {} as App.Locals
		};
		const resolve = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

		const response = await handle({ event: event as never, resolve });

		expect(response.status).not.toBe(403);
	});
});
