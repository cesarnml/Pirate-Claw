import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

function jsonResponse(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status });
}

function requestEvent(url: string) {
	return { url: new URL(url) } as never;
}

describe('GET /calendar/more', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
	});

	it('proxies the offset to GET /api/calendar/tv', async () => {
		const { GET } = await import('../../../src/routes/calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, { items: [{ tmdbId: 1, name: 'Show' }], total: 30 })
		);

		const response = await GET(requestEvent('http://localhost/calendar/more?offset=16'));
		const body = await response.json();

		expect(apiRequestMock).toHaveBeenCalledWith('/api/calendar/tv?offset=16&limit=16');
		expect(body).toEqual({ items: [{ tmdbId: 1, name: 'Show' }], total: 30 });
	});

	it('defaults offset to 0 when missing or invalid', async () => {
		const { GET } = await import('../../../src/routes/calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0 }));

		await GET(requestEvent('http://localhost/calendar/more?offset=not-a-number'));

		expect(apiRequestMock).toHaveBeenCalledWith('/api/calendar/tv?offset=0&limit=16');
	});

	it('clamps a requested limit above the page size', async () => {
		const { GET } = await import('../../../src/routes/calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0 }));

		await GET(requestEvent('http://localhost/calendar/more?offset=0&limit=9999'));

		expect(apiRequestMock).toHaveBeenCalledWith('/api/calendar/tv?offset=0&limit=16');
	});

	it('returns 503 when the daemon is unreachable', async () => {
		const { GET } = await import('../../../src/routes/calendar/more/+server');
		apiRequestMock.mockRejectedValueOnce(new Error('connection refused'));

		const response = await GET(requestEvent('http://localhost/calendar/more?offset=0'));

		expect(response.status).toBe(503);
	});

	it('forwards the daemon status code on a non-ok response', async () => {
		const { GET } = await import('../../../src/routes/calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(jsonResponse(409, { error: 'tmdb is not configured' }));

		const response = await GET(requestEvent('http://localhost/calendar/more?offset=0'));

		expect(response.status).toBe(409);
	});
});
