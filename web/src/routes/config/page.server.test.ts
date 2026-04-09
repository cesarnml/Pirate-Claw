import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		PIRATE_CLAW_API_WRITE_TOKEN: 'write-token'
	}
}));

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

describe('config page server actions', () => {
	it('rejects out-of-scope fields before API call', async () => {
		const { actions } = await import('./+page.server');
		apiRequestMock.mockReset();

		const body = new URLSearchParams();
		body.set('ifMatch', '"rev-1"');
		body.set('runIntervalMinutes', '15');
		body.set('feeds', '[]');

		const result = await actions.saveRuntime({
			request: new Request('http://localhost/config', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body
			})
		} as never);

		expect((result as { status?: number }).status).toBe(400);
		expect((result as { data?: { message?: string } }).data?.message).toContain('not allowed');
		expect(apiRequestMock).not.toHaveBeenCalled();
	});

	it('rejects out-of-range runtime values', async () => {
		const { actions } = await import('./+page.server');
		apiRequestMock.mockReset();

		const body = new URLSearchParams();
		body.set('ifMatch', '"rev-1"');
		body.set('runIntervalMinutes', '0');

		const result = await actions.saveRuntime({
			request: new Request('http://localhost/config', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body
			})
		} as never);

		expect((result as { status?: number }).status).toBe(400);
		expect((result as { data?: { message?: string } }).data?.message).toContain(
			'runIntervalMinutes'
		);
		expect(apiRequestMock).not.toHaveBeenCalled();
	});
});
