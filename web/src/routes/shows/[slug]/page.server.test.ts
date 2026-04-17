import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock,
	apiFetch: apiFetchMock
}));

describe('shows detail page server', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		apiFetchMock.mockReset();
		vi.resetModules();
	});

	describe('load', () => {
		it('returns canWrite and resolves the requested show', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('./+page.server');

			apiFetchMock
				.mockResolvedValueOnce({
					shows: [
						{
							normalizedTitle: 'The Show',
							plexStatus: 'unknown',
							watchCount: null,
							lastWatchedAt: null,
							seasons: []
						}
					]
				})
				.mockResolvedValueOnce({ torrents: [] });

			const result = await load({ params: { slug: 'the show' } } as never);

			expect((result as { canWrite: boolean }).canWrite).toBe(true);
			expect((result as { show: { normalizedTitle: string } | null }).show?.normalizedTitle).toBe(
				'The Show'
			);
		});
	});

	describe('refreshTmdb', () => {
		it('calls the refresh endpoint and returns success on happy path', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

			const result = await actions.refreshTmdb({ params: { slug: 'the show' } } as never);

			expect((result as { refreshSuccess?: boolean }).refreshSuccess).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/shows/the%20show/tmdb/refresh',
				expect.objectContaining({
					method: 'POST',
					headers: { authorization: 'Bearer write-token' }
				})
			);
		});

		it('returns fail(403) when write access is unavailable', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: {}
			}));
			const { actions } = await import('./+page.server');

			const result = await actions.refreshTmdb({ params: { slug: 'the show' } } as never);

			expect((result as { status?: number }).status).toBe(403);
			expect((result as { data?: { refreshMessage?: string } }).data?.refreshMessage).toContain(
				'write access'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});
	});
});
