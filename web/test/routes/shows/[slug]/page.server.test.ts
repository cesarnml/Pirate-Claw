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
			const { load } = await import('../../../../src/routes/shows/[slug]/+page.server');

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
				.mockResolvedValueOnce({ plexReachable: true, seasons: [] });

			const result = await load({ params: { slug: 'the show' } } as never);

			expect((result as { canWrite: boolean }).canWrite).toBe(true);
			expect((result as { show: { normalizedTitle: string } | null }).show?.normalizedTitle).toBe(
				'The Show'
			);
			expect(
				(result as { episodeStatus: { plexReachable: boolean } | null }).episodeStatus
			).toEqual({ plexReachable: true, seasons: [] });
			expect(apiFetchMock).toHaveBeenCalledWith('/api/shows/the%20show/episodes');
		});

		it('treats a failed episode-status fetch as non-fatal', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('../../../../src/routes/shows/[slug]/+page.server');

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
				.mockRejectedValueOnce(new Error('tmdb not configured'));

			const result = await load({ params: { slug: 'the show' } } as never);

			expect((result as { show: unknown }).show).not.toBeNull();
			expect((result as { episodeStatus: unknown }).episodeStatus).toBeNull();
			expect((result as { episodeStatusError: string | null }).episodeStatusError).toBeTruthy();
		});
	});

	describe('refreshTmdb', () => {
		it('calls the refresh endpoint and returns success on happy path', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');
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
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');

			const result = await actions.refreshTmdb({ params: { slug: 'the show' } } as never);

			expect((result as { status?: number }).status).toBe(403);
			expect((result as { data?: { refreshMessage?: string } }).data?.refreshMessage).toContain(
				'write access'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});
	});

	describe('manualGrab', () => {
		function grabRequest(fields: Record<string, string>): Request {
			const body = new FormData();
			for (const [key, value] of Object.entries(fields)) {
				body.set(key, value);
			}
			return new Request('http://localhost/shows/the-show', { method: 'POST', body });
		}

		it('posts to /manual-grab and returns success on the happy path', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify({ ok: true, grab: {} }), { status: 200 })
			);

			const result = await actions.manualGrab({
				params: { slug: 'the show' },
				request: grabRequest({
					season: '4',
					episode: '6',
					magnetUrl: 'magnet:?xt=urn:btih:abc',
					rawTitle: 'The Show S04E06'
				})
			} as never);

			expect((result as { grabSuccess?: boolean }).grabSuccess).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/shows/the%20show/manual-grab',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({ authorization: 'Bearer write-token' })
				})
			);
		});

		it('returns fail(400) for missing grab details without calling the API', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');

			const result = await actions.manualGrab({
				params: { slug: 'the show' },
				request: grabRequest({ season: '4' })
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('returns fail(403) when write access is unavailable', async () => {
			vi.doMock('$env/dynamic/private', () => ({ env: {} }));
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');

			const result = await actions.manualGrab({
				params: { slug: 'the show' },
				request: grabRequest({
					season: '4',
					episode: '6',
					magnetUrl: 'magnet:?xt=urn:btih:abc',
					rawTitle: 'The Show S04E06'
				})
			} as never);

			expect((result as { status?: number }).status).toBe(403);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});
	});
});
