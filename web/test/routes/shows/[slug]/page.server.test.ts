import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock,
	apiFetch: apiFetchMock,
	// The load's two sequential reads now go through navApiFetch (short
	// timeout + retry — see api.ts's NAV_TIMEOUT_MS); actions still use
	// apiRequest. Alias to the same mock so this suite's expectations still
	// apply.
	navApiFetch: apiFetchMock
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

		// See mergeFreshSeasonCompletions's doc comment in +page.server.ts —
		// /api/shows's seasonCompletions snapshot is captured before this same
		// request's own /episodes call runs (and, server-side, persists an
		// updated row for whichever season it walked), so the top card must
		// prefer the just-fetched episode grid over that stale snapshot.
		it('overrides the stale seasonCompletions entry with the freshly-fetched episode grid', async () => {
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
							seasons: [],
							seasonCompletions: [
								{ season: 1, airedCount: 8, ownedCount: 7, cachedAt: '2026-09-01T00:00:00.000Z' }
							]
						}
					]
				})
				.mockResolvedValueOnce({
					plexReachable: true,
					seasons: [
						{
							season: 1,
							episodeCountMismatch: false,
							airedEpisodeCount: 8,
							episodes: Array.from({ length: 8 }, (_, i) => ({
								episode: i + 1,
								plexStatus: 'in_library',
								airDate: '2026-08-05',
								manualGrabs: []
							}))
						}
					]
				});

			const result = await load({ params: { slug: 'the show' } } as never);

			// The stale ownedCount:7 from /api/shows must not survive — the
			// fresh per-episode walk (all 8 in_library) is what the top card
			// should read.
			expect(
				(result as { show: { seasonCompletions?: unknown[] } | null }).show?.seasonCompletions
			).toEqual([{ season: 1, airedCount: 8, ownedCount: 8, cachedAt: expect.any(String) }]);
		});

		it('leaves seasonCompletions untouched when Plex was not reachable for the fresh walk', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('../../../../src/routes/shows/[slug]/+page.server');

			const staleCompletions = [
				{ season: 1, airedCount: 8, ownedCount: 7, cachedAt: '2026-09-01T00:00:00.000Z' }
			];
			apiFetchMock
				.mockResolvedValueOnce({
					shows: [
						{
							normalizedTitle: 'The Show',
							plexStatus: 'unknown',
							watchCount: null,
							lastWatchedAt: null,
							seasons: [],
							seasonCompletions: staleCompletions
						}
					]
				})
				.mockResolvedValueOnce({ plexReachable: false, seasons: [] });

			const result = await load({ params: { slug: 'the show' } } as never);

			expect(
				(result as { show: { seasonCompletions?: unknown[] } | null }).show?.seasonCompletions
			).toEqual(staleCompletions);
		});

		it('skips a season with any unknown episode rather than caching a false completion count', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('../../../../src/routes/shows/[slug]/+page.server');

			const staleCompletions = [
				{ season: 1, airedCount: 8, ownedCount: 7, cachedAt: '2026-09-01T00:00:00.000Z' }
			];
			apiFetchMock
				.mockResolvedValueOnce({
					shows: [
						{
							normalizedTitle: 'The Show',
							plexStatus: 'unknown',
							watchCount: null,
							lastWatchedAt: null,
							seasons: [],
							seasonCompletions: staleCompletions
						}
					]
				})
				.mockResolvedValueOnce({
					plexReachable: true,
					seasons: [
						{
							season: 1,
							episodeCountMismatch: false,
							airedEpisodeCount: 1,
							episodes: [{ episode: 1, plexStatus: 'unknown', manualGrabs: [] }]
						}
					]
				});

			const result = await load({ params: { slug: 'the show' } } as never);

			expect(
				(result as { show: { seasonCompletions?: unknown[] } | null }).show?.seasonCompletions
			).toEqual(staleCompletions);
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

	describe('refreshPlex', () => {
		it('calls the refresh endpoint and returns success on happy path', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');
			apiRequestMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

			const result = await actions.refreshPlex({ params: { slug: 'the show' } } as never);

			expect((result as { plexRefreshSuccess?: boolean }).plexRefreshSuccess).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/shows/the%20show/plex/refresh',
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

			const result = await actions.refreshPlex({ params: { slug: 'the show' } } as never);

			expect((result as { status?: number }).status).toBe(403);
			expect(
				(result as { data?: { plexRefreshMessage?: string } }).data?.plexRefreshMessage
			).toContain('write access');
			expect(apiRequestMock).not.toHaveBeenCalled();
		});
	});

	describe('removeShow', () => {
		it('calls DELETE on the show endpoint and returns success on happy path', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');
			apiRequestMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

			const result = await actions.removeShow({ params: { slug: 'the show' } } as never);

			expect((result as { removeSuccess?: boolean }).removeSuccess).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/shows/the%20show',
				expect.objectContaining({
					method: 'DELETE',
					headers: { authorization: 'Bearer write-token' }
				})
			);
		});

		it('returns fail(403) when write access is unavailable', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: {}
			}));
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');

			const result = await actions.removeShow({ params: { slug: 'the show' } } as never);

			expect((result as { status?: number }).status).toBe(403);
			expect((result as { data?: { removeMessage?: string } }).data?.removeMessage).toContain(
				'write access'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('surfaces the API error message on failure', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('../../../../src/routes/shows/[slug]/+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify({ error: 'show not found' }), { status: 404 })
			);

			const result = await actions.removeShow({ params: { slug: 'the show' } } as never);

			expect((result as { status?: number }).status).toBe(404);
			expect((result as { data?: { removeMessage?: string } }).data?.removeMessage).toBe(
				'show not found'
			);
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
