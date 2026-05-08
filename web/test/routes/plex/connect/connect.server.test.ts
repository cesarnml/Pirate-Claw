// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

describe('GET /plex/connect', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
	});

	it('includes returnTo as query param in forwardUrl when returnTo is in search params', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));

		apiRequestMock.mockResolvedValue(
			new Response(JSON.stringify({ redirectUrl: 'https://plex.tv/auth' }), { status: 200 })
		);

		const { GET } = await import('../../../../src/routes/plex/connect/+server');

		const url = new URL('http://localhost/plex/connect?returnTo=%2Fonboarding');
		const event = {
			url,
			request: new Request(url),
			locals: {} as App.Locals,
			cookies: { get: vi.fn() }
		};

		await GET(event as never).catch(() => {});

		expect(apiRequestMock).toHaveBeenCalledWith(
			'/api/plex/auth/start',
			expect.objectContaining({
				body: expect.stringContaining('"returnTo":"/onboarding"')
			})
		);

		const callBody = JSON.parse(apiRequestMock.mock.calls[0][1].body as string) as {
			forwardUrl: string;
			returnTo: string;
		};
		const forwardUrl = new URL(callBody.forwardUrl);
		expect(forwardUrl.searchParams.get('returnTo')).toBe('/onboarding');
	});

	it('uses /config as fallback returnTo when returnTo param is absent', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));

		apiRequestMock.mockResolvedValue(
			new Response(JSON.stringify({ redirectUrl: 'https://plex.tv/auth' }), { status: 200 })
		);

		const { GET } = await import('../../../../src/routes/plex/connect/+server');

		const url = new URL('http://localhost/plex/connect');
		const event = {
			url,
			request: new Request(url),
			locals: {} as App.Locals,
			cookies: { get: vi.fn() }
		};

		await GET(event as never).catch(() => {});

		const callBody = JSON.parse(apiRequestMock.mock.calls[0][1].body as string) as {
			forwardUrl: string;
			returnTo: string;
		};
		const forwardUrl = new URL(callBody.forwardUrl);
		expect(forwardUrl.searchParams.get('returnTo')).toBe('/config');
	});
});
