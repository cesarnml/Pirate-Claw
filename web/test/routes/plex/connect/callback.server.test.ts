// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

describe('GET /plex/connect/callback load', () => {
	const savedLogLevel = process.env.PIRATE_CLAW_LOG_LEVEL;

	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
		process.env.PIRATE_CLAW_LOG_LEVEL = 'silent';
	});

	afterEach(() => {
		if (savedLogLevel !== undefined) {
			process.env.PIRATE_CLAW_LOG_LEVEL = savedLogLevel;
		} else {
			delete process.env.PIRATE_CLAW_LOG_LEVEL;
		}
	});

	it('uses returnTo from the callback URL instead of the daemon response body', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		apiRequestMock.mockResolvedValue(
			new Response(JSON.stringify({ returnTo: '/config' }), { status: 200 })
		);

		const { load } = await import('../../../../src/routes/plex/connect/callback/+page.server');

		const result = (await load({
			url: new URL('http://localhost/plex/connect/callback?session=abc&returnTo=%2Fonboarding')
		} as never)) as { returnTo: string };

		expect(result.returnTo).toBe('/onboarding');
		expect(apiRequestMock).toHaveBeenCalledWith(
			'/api/plex/auth/finalize',
			expect.objectContaining({
				body: JSON.stringify({ sessionId: 'abc' })
			})
		);
	});

	it('honors PIRATE_CLAW_LOG_LEVEL=silent on successful callback logging', async () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		apiRequestMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

		const { load } = await import('../../../../src/routes/plex/connect/callback/+page.server');

		await load({
			url: new URL('http://localhost/plex/connect/callback?session=abc&returnTo=%2Fconfig')
		} as never);

		expect(logSpy).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalled();
		logSpy.mockRestore();
		warnSpy.mockRestore();
	});
});
