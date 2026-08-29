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

const thisYear = new Date().getFullYear();

describe('GET /tv-calendar/more', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
	});

	it('proxies the offset and year to GET /api/calendar/tv', async () => {
		const { GET } = await import('../../../src/routes/tv-calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, { year: 2020, items: [{ tmdbId: 1, name: 'Show' }], total: 30, offset: 16 })
		);

		const response = await GET(requestEvent('http://localhost/tv-calendar/more?year=2020&offset=16'));
		const body = await response.json();

		expect(apiRequestMock).toHaveBeenCalledWith('/api/calendar/tv?year=2020&limit=16&offset=16');
		expect(body).toEqual({
			year: 2020,
			items: [{ tmdbId: 1, name: 'Show' }],
			total: 30,
			offset: 16
		});
	});

	it('defaults year to the current year when missing', async () => {
		const { GET } = await import('../../../src/routes/tv-calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, { year: thisYear, items: [], total: 0, offset: 0 })
		);

		await GET(requestEvent('http://localhost/tv-calendar/more?offset=16'));

		expect(apiRequestMock).toHaveBeenCalledWith(
			`/api/calendar/tv?year=${thisYear}&limit=16&offset=16`
		);
	});

	it('forwards offset omitted rather than defaulting to 0, for the anchor-to-last-page rollover', async () => {
		// Real behavior this covers: "load earlier months" rolling into the
		// previous year omits offset on purpose, so the daemon's auto-anchor
		// (anchorOffsetForToday) lands on that year's *last* page, not its
		// first. Silently defaulting offset to 0 here would defeat that.
		const { GET } = await import('../../../src/routes/tv-calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, { year: 2020, items: [], total: 40, offset: 24 })
		);

		await GET(requestEvent('http://localhost/tv-calendar/more?year=2020'));

		expect(apiRequestMock).toHaveBeenCalledWith('/api/calendar/tv?year=2020&limit=16');
	});

	it('treats a non-numeric offset as omitted rather than defaulting it to 0', async () => {
		// A garbage offset (e.g. a tampered request) should behave like no
		// offset was supplied at all, not silently collapse to 0 — otherwise
		// it would defeat the daemon's auto-anchor-to-today behavior.
		const { GET } = await import('../../../src/routes/tv-calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, { year: thisYear, items: [], total: 0, offset: 0 })
		);

		await GET(requestEvent('http://localhost/tv-calendar/more?year=2020&offset=abc'));

		expect(apiRequestMock).toHaveBeenCalledWith('/api/calendar/tv?year=2020&limit=16');
	});

	it('clamps a requested limit above the page size', async () => {
		const { GET } = await import('../../../src/routes/tv-calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, { year: thisYear, items: [], total: 0, offset: 0 })
		);

		await GET(requestEvent('http://localhost/tv-calendar/more?offset=0&limit=9999'));

		expect(apiRequestMock).toHaveBeenCalledWith(
			`/api/calendar/tv?year=${thisYear}&limit=16&offset=0`
		);
	});

	it('returns 503 when the daemon is unreachable', async () => {
		const { GET } = await import('../../../src/routes/tv-calendar/more/+server');
		apiRequestMock.mockRejectedValueOnce(new Error('connection refused'));

		const response = await GET(requestEvent('http://localhost/tv-calendar/more?offset=0'));

		expect(response.status).toBe(503);
	});

	it('forwards the daemon status code on a non-ok response', async () => {
		const { GET } = await import('../../../src/routes/tv-calendar/more/+server');
		apiRequestMock.mockResolvedValueOnce(jsonResponse(409, { error: 'tmdb is not configured' }));

		const response = await GET(requestEvent('http://localhost/tv-calendar/more?offset=0'));

		expect(response.status).toBe(409);
	});
});
