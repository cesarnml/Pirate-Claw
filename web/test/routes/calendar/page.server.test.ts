import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), { status, headers });
}

type LoadResult = {
	year: number;
	items: unknown[];
	total: number;
	offset: number;
	tmdbConfigured: boolean;
	error: string | null;
};

describe('calendar page server load', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
	});

	it('returns year, items, total, and offset on a successful calendar fetch', async () => {
		const { load } = await import('../../../src/routes/calendar/+page.server');
		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, {
				year: 2026,
				items: [{ tmdbId: 1, name: 'Show', alreadyTracked: false }],
				total: 37,
				offset: 12
			})
		);

		const result = (await load({} as never)) as LoadResult;

		expect(result.tmdbConfigured).toBe(true);
		expect(result.error).toBeNull();
		expect(result.year).toBe(2026);
		expect(result.items).toHaveLength(1);
		expect(result.total).toBe(37);
		expect(result.offset).toBe(12);
	});

	it('requests only a bounded first page, with no offset (lets the daemon auto-anchor to today)', async () => {
		// Regression: an unpaginated ~40-item response was found to be large
		// enough to break client-side hydration on some mobile/VPN network
		// paths. The initial SSR load must only ask for a bounded first page —
		// and it must NOT pass offset=0, since omitting it is what lets the
		// daemon land the visitor on today's part of the calendar instead of
		// always page 1 / January.
		const { load, _PAGE_SIZE } = await import('../../../src/routes/calendar/+page.server');
		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, { year: 2026, items: [], total: 0, offset: 0 })
		);

		await load({} as never);

		expect(apiRequestMock).toHaveBeenCalledWith(`/api/calendar/tv?limit=${_PAGE_SIZE}`);
	});

	it('reports tmdbConfigured=false when the daemon returns 409', async () => {
		const { load } = await import('../../../src/routes/calendar/+page.server');
		apiRequestMock.mockResolvedValueOnce(jsonResponse(409, { error: 'tmdb is not configured' }));

		const result = (await load({} as never)) as LoadResult;

		expect(result.tmdbConfigured).toBe(false);
		expect(result.items).toEqual([]);
		expect(result.error).toBeNull();
	});

	it('surfaces an error when the daemon is unreachable', async () => {
		const { load } = await import('../../../src/routes/calendar/+page.server');
		apiRequestMock.mockRejectedValueOnce(new Error('connection refused'));

		const result = (await load({} as never)) as LoadResult;

		expect(result.error).toBe('Could not reach the API.');
		expect(result.items).toEqual([]);
	});
});

describe('calendar page addShow action', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
	});

	function formRequest(name: string) {
		const formData = new FormData();
		formData.set('name', name);
		return { formData: () => Promise.resolve(formData) } as unknown as Request;
	}

	it('fails when no write token is configured', async () => {
		vi.doMock('$env/dynamic/private', () => ({ env: {} }));
		const { actions } = await import('../../../src/routes/calendar/+page.server');

		const result = (await actions.addShow({ request: formRequest('New Show') } as never)) as {
			status: number;
			data: { addShowMessage: string };
		};

		expect(result.status).toBe(500);
	});

	it('prepends the new show to the existing list and PUTs the merged config', async () => {
		vi.doMock('$env/dynamic/private', () => ({ env: { PIRATE_CLAW_API_WRITE_TOKEN: 'token' } }));
		const { actions } = await import('../../../src/routes/calendar/+page.server');

		apiRequestMock
			.mockResolvedValueOnce(
				jsonResponse(200, { tv: [{ name: 'Existing Show' }] }, { etag: '"abc"' })
			)
			.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

		const result = (await actions.addShow({ request: formRequest('New Show') } as never)) as {
			addShowSuccess: boolean;
			addedName: string;
		};

		expect(result.addShowSuccess).toBe(true);
		expect(result.addedName).toBe('New Show');

		const putCall = apiRequestMock.mock.calls[1];
		expect(putCall[0]).toBe('/api/config');
		const putInit = putCall[1] as { method: string; body: string; headers: Record<string, string> };
		expect(putInit.method).toBe('PUT');
		expect(putInit.headers['if-match']).toBe('"abc"');
		expect(JSON.parse(putInit.body)).toEqual({
			runtime: {},
			tv: { shows: ['New Show', 'Existing Show'] }
		});
	});

	it('is a no-op (no PUT) when the show is already tracked', async () => {
		vi.doMock('$env/dynamic/private', () => ({ env: { PIRATE_CLAW_API_WRITE_TOKEN: 'token' } }));
		const { actions } = await import('../../../src/routes/calendar/+page.server');

		apiRequestMock.mockResolvedValueOnce(
			jsonResponse(200, { tv: [{ name: 'Already Here' }] }, { etag: '"abc"' })
		);

		const result = (await actions.addShow({
			request: formRequest('already here')
		} as never)) as { addShowSuccess: boolean };

		expect(result.addShowSuccess).toBe(true);
		expect(apiRequestMock).toHaveBeenCalledTimes(1);
	});

	it('fails when name is blank', async () => {
		vi.doMock('$env/dynamic/private', () => ({ env: { PIRATE_CLAW_API_WRITE_TOKEN: 'token' } }));
		const { actions } = await import('../../../src/routes/calendar/+page.server');

		const result = (await actions.addShow({ request: formRequest('   ') } as never)) as {
			status: number;
		};

		expect(result.status).toBe(400);
	});
});
