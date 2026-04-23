import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

describe('/api/daemon/restart-status proxy', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
	});

	it('proxies the backend restart status payload', async () => {
		apiRequestMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					state: 'requested',
					requestId: 'restart-123'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		const { GET } = await import('../../../../src/routes/api/daemon/restart-status/+server');

		const response = await GET();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			state: 'requested',
			requestId: 'restart-123'
		});
	});

	it('returns 502 when the backend is unavailable', async () => {
		apiRequestMock.mockRejectedValue(new Error('connection refused'));
		const { GET } = await import('../../../../src/routes/api/daemon/restart-status/+server');

		const response = await GET();

		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: 'Could not reach the API.' });
	});
});
