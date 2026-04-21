import { beforeEach, describe, expect, it, vi } from 'vitest';
import emptyConfig from '../../../../fixtures/api/config-empty.json';
import feedOnlyConfig from '../../../../fixtures/api/config-feed-only.json';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

describe('onboarding page server', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
	});

	describe('load', () => {
		it('returns writes_disabled onboarding state when writes are unavailable', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: '' }
			}));
			const { load } = await import('./+page.server');
			apiRequestMock.mockImplementation((url: string) =>
				url === '/api/setup/readiness'
					? Promise.resolve(
							new Response(
								JSON.stringify({
									state: 'not_ready',
									configState: 'starter',
									transmissionReachable: false,
									daemonLive: true
								}),
								{ status: 200 }
							)
						)
					: Promise.resolve(new Response(JSON.stringify(emptyConfig), { status: 200 }))
			);

			const result = await load({} as never);
			expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
				'writes_disabled'
			);
		});

		it('returns initial_empty onboarding state for strict empty config', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('./+page.server');
			apiRequestMock.mockImplementation((url: string) =>
				url === '/api/setup/readiness'
					? Promise.resolve(
							new Response(
								JSON.stringify({
									state: 'not_ready',
									configState: 'starter',
									transmissionReachable: false,
									daemonLive: true
								}),
								{ status: 200 }
							)
						)
					: Promise.resolve(
							new Response(JSON.stringify(emptyConfig), {
								status: 200,
								headers: { etag: '"rev-1"' }
							})
						)
			);

			const result = await load({} as never);
			expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
				'initial_empty'
			);
		});

		it('returns partial_setup onboarding state for feed-only config', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('./+page.server');
			apiRequestMock.mockImplementation((url: string) =>
				url === '/api/setup/readiness'
					? Promise.resolve(
							new Response(
								JSON.stringify({
									state: 'not_ready',
									configState: 'partially_configured',
									transmissionReachable: false,
									daemonLive: true
								}),
								{ status: 200 }
							)
						)
					: Promise.resolve(
							new Response(JSON.stringify(feedOnlyConfig), {
								status: 200,
								headers: { etag: '"rev-2"' }
							})
						)
			);

			const result = await load({} as never);
			expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
				'partial_setup'
			);
		});
	});

	describe('saveFeed', () => {
		it('returns fail(400) when ifMatch is missing', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('feedName', 'TV Feed');
			body.set('feedUrl', 'https://example.com/feed.rss');
			body.set('feedMediaType', 'tv');

			const result = await actions.saveFeed({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { feedsMessage?: string } }).data?.feedsMessage).toContain(
				'Missing config revision'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('passes validation failures through from the feeds endpoint', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify({ error: 'Feed URL failed validation.' }), {
					status: 400,
					headers: { etag: '"rev-2"' }
				})
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('feedName', 'TV Feed');
			body.set('feedUrl', 'https://example.com/feed.rss');
			body.set('feedMediaType', 'tv');
			body.set('existingFeedsJson', JSON.stringify([]));

			const result = await actions.saveFeed({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { feedsMessage?: string } }).data?.feedsMessage).toContain(
				'Feed URL failed validation'
			);
		});

		it('returns feedsSuccess with fresh etag on happy path', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(null, { status: 200, headers: { etag: '"rev-2"' } })
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('feedName', 'TV Feed');
			body.set('feedUrl', 'https://example.com/feed.rss');
			body.set('feedMediaType', 'tv');
			body.set('existingFeedsJson', JSON.stringify([]));

			const result = await actions.saveFeed({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { feedsSuccess?: boolean }).feedsSuccess).toBe(true);
			expect((result as { feedsEtag?: string }).feedsEtag).toBe('"rev-2"');
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/config/feeds',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify([
						{
							name: 'TV Feed',
							url: 'https://example.com/feed.rss',
							mediaType: 'tv'
						}
					])
				})
			);
		});
	});

	describe('saveTvTarget', () => {
		it('returns fail(400) when ifMatch is missing', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('showName', 'Show Alpha');

			const result = await actions.saveTvTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { tvTargetMessage?: string } }).data?.tvTargetMessage).toContain(
				'Missing config revision'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('appends a new show after saving tv defaults', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock
				.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"rev-2"' } }))
				.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"rev-3"' } }));

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('showName', 'Show Beta');
			body.set('existingShowsJson', JSON.stringify(['Show Alpha']));
			body.append('tvResolution', '1080p');
			body.append('tvCodec', 'x265');

			const result = await actions.saveTvTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { tvTargetSuccess?: boolean }).tvTargetSuccess).toBe(true);
			expect((result as { tvTargetEtag?: string }).tvTargetEtag).toBe('"rev-3"');
			expect(apiRequestMock).toHaveBeenNthCalledWith(
				1,
				'/api/config/tv/defaults',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ resolutions: ['1080p'], codecs: ['x265'] })
				})
			);
			expect(apiRequestMock).toHaveBeenNthCalledWith(
				2,
				'/api/config',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ runtime: {}, tv: { shows: ['Show Alpha', 'Show Beta'] } })
				})
			);
		});

		it('does not duplicate an existing show name', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock
				.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"rev-2"' } }))
				.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"rev-3"' } }));

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('showName', 'Show Alpha');
			body.set('existingShowsJson', JSON.stringify(['Show Alpha']));

			const result = await actions.saveTvTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { tvTargetSuccess?: boolean }).tvTargetSuccess).toBe(true);
			expect(apiRequestMock).toHaveBeenNthCalledWith(
				2,
				'/api/config',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ runtime: {}, tv: { shows: ['Show Alpha'] } })
				})
			);
		});

		it('returns the post-defaults etag when the show save fails', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock
				.mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"rev-2"' } }))
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ error: 'stale revision' }), { status: 409 })
				);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('showName', 'Show Beta');
			body.set('existingShowsJson', JSON.stringify(['Show Alpha']));

			const result = await actions.saveTvTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(409);
			expect((result as { data?: { tvTargetEtag?: string } }).data?.tvTargetEtag).toBe('"rev-2"');
		});

		it('surfaces tv defaults save errors', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify({ error: 'TV defaults failed.' }), {
					status: 400,
					headers: { etag: '"rev-2"' }
				})
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('showName', 'Show Alpha');
			body.set('existingShowsJson', JSON.stringify([]));

			const result = await actions.saveTvTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { tvTargetMessage?: string } }).data?.tvTargetMessage).toContain(
				'TV defaults failed'
			);
		});
	});

	describe('saveMovieTarget', () => {
		it('validates movie year bounds', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('movieYear', '1899');
			body.set('movieCodecPolicy', 'prefer');

			const result = await actions.saveMovieTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect(
				(result as { data?: { movieTargetMessage?: string } }).data?.movieTargetMessage
			).toContain('between 1900 and 2100');
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('validates codec policy', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('movieYear', '2024');
			body.set('movieCodecPolicy', 'sometimes');

			const result = await actions.saveMovieTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect(
				(result as { data?: { movieTargetMessage?: string } }).data?.movieTargetMessage
			).toContain('Codec policy');
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('preserves existing movie policy during resumed onboarding', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(null, { status: 200, headers: { etag: '"rev-2"' } })
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('movieYear', '2024');
			body.set('movieCodecPolicy', 'prefer');
			body.set('existingMovieYearsJson', JSON.stringify([2023]));
			body.set('existingMovieResolutionsJson', JSON.stringify(['1080p']));
			body.set('existingMovieCodecsJson', JSON.stringify(['x265']));
			body.set('existingMovieCodecPolicy', 'require');
			body.append('movieResolution', '720p');
			body.append('movieCodec', 'x264');

			const result = await actions.saveMovieTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { movieTargetSuccess?: boolean }).movieTargetSuccess).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/config/movies',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({
						years: [2023, 2024],
						resolutions: ['1080p'],
						codecs: ['x265'],
						codecPolicy: 'require'
					})
				})
			);
		});

		it('seeds an empty movie policy from onboarding inputs', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(null, { status: 200, headers: { etag: '"rev-2"' } })
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('movieYear', '2024');
			body.set('movieCodecPolicy', 'prefer');
			body.set('existingMovieYearsJson', JSON.stringify([]));
			body.set('existingMovieResolutionsJson', JSON.stringify([]));
			body.set('existingMovieCodecsJson', JSON.stringify([]));
			body.set('existingMovieCodecPolicy', 'prefer');
			body.append('movieResolution', '1080p');
			body.append('movieCodec', 'x265');

			const result = await actions.saveMovieTarget({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { movieTargetSuccess?: boolean }).movieTargetSuccess).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/config/movies',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({
						years: [2024],
						resolutions: ['1080p'],
						codecs: ['x265'],
						codecPolicy: 'prefer'
					})
				})
			);
		});
	});

	describe('testTransmission', () => {
		it('uses the read-only transmission session endpoint', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: {}
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(
					JSON.stringify({
						version: '3.00',
						downloadSpeed: 0,
						uploadSpeed: 0,
						activeTorrentCount: 0,
						cumulativeDownloadedBytes: 0,
						cumulativeUploadedBytes: 0,
						currentDownloadedBytes: 0,
						currentUploadedBytes: 0
					}),
					{ status: 200 }
				)
			);

			const result = await actions.testTransmission({} as never);

			expect((result as { transmissionReachable?: boolean }).transmissionReachable).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith('/api/transmission/session');
		});
	});

	describe('saveDownloadDirs', () => {
		it('returns fail(400) when ifMatch is missing', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('tvDir', '/data/tv');

			const result = await actions.saveDownloadDirs({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect(
				(result as { data?: { downloadDirsMessage?: string } }).data?.downloadDirsMessage
			).toContain('Missing config revision');
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('sends an empty object when both fields are blank so existing download dirs can be cleared', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(null, { status: 200, headers: { etag: '"rev-2"' } })
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('tvDir', '');
			body.set('movieDir', '');

			const result = await actions.saveDownloadDirs({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { downloadDirsSuccess?: boolean }).downloadDirsSuccess).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/config/transmission/download-dirs',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({})
				})
			);
		});
	});
});
