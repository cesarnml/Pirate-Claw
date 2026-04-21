import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

describe('config page server actions', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
	});

	describe('load', () => {
		it('returns onboarding status for partial setup config', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('./+page.server');

			apiRequestMock
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							feeds: [{ name: 'TV Feed', url: 'https://example.com/tv.rss', mediaType: 'tv' }],
							tv: [],
							movies: { years: [], resolutions: [], codecs: [], codecPolicy: 'prefer' },
							transmission: { url: 'http://localhost:9091', username: '', password: '' },
							runtime: {
								runIntervalMinutes: 60,
								reconcileIntervalSeconds: 60,
								artifactDir: '/tmp',
								artifactRetentionDays: 7
							}
						}),
						{ status: 200 }
					)
				)
				.mockRejectedValueOnce(new Error('network error'))
				.mockResolvedValueOnce(new Response(JSON.stringify({ runs: [] }), { status: 200 }));

			const result = await load({} as never);
			expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
				'partial_setup'
			);
		});

		it('returns transmissionSession: null when session fetch fails', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('./+page.server');

			apiRequestMock
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							feeds: [],
							tv: [],
							movies: { years: [], resolutions: [], codecs: [], codecPolicy: 'prefer' },
							transmission: { url: 'http://localhost:9091', username: '', password: '' },
							runtime: {
								runIntervalMinutes: 60,
								reconcileIntervalSeconds: 60,
								artifactDir: '/tmp',
								artifactRetentionDays: 7
							}
						}),
						{ status: 200 }
					)
				)
				.mockRejectedValueOnce(new Error('network error'))
				.mockResolvedValueOnce(new Response(JSON.stringify({ runs: [] }), { status: 200 }));

			const result = await load({} as never);
			expect((result as { transmissionSession: unknown }).transmissionSession).toBeNull();
		});

		it('returns transmissionSession with version when session fetch succeeds', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('./+page.server');

			apiRequestMock
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							feeds: [],
							tv: [],
							movies: { years: [], resolutions: [], codecs: [], codecPolicy: 'prefer' },
							transmission: { url: 'http://localhost:9091', username: '', password: '' },
							runtime: {
								runIntervalMinutes: 60,
								reconcileIntervalSeconds: 60,
								artifactDir: '/tmp',
								artifactRetentionDays: 7
							}
						}),
						{ status: 200 }
					)
				)
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							version: '3.00 (bb6b5a062ef)',
							downloadSpeed: 2_097_152,
							uploadSpeed: 524_288,
							activeTorrentCount: 4,
							cumulativeDownloadedBytes: 5_509_110_251_520,
							cumulativeUploadedBytes: 1_060_143_431_680,
							currentDownloadedBytes: 2_147_483_648,
							currentUploadedBytes: 536_870_912
						}),
						{ status: 200 }
					)
				)
				.mockResolvedValueOnce(new Response(JSON.stringify({ runs: [] }), { status: 200 }));

			const result = await load({} as never);
			expect((result as { transmissionSession: unknown }).transmissionSession).toEqual({
				version: '3.00 (bb6b5a062ef)',
				downloadSpeed: 2_097_152,
				uploadSpeed: 524_288,
				activeTorrentCount: 4,
				cumulativeDownloadedBytes: 5_509_110_251_520,
				cumulativeUploadedBytes: 1_060_143_431_680,
				currentDownloadedBytes: 2_147_483_648,
				currentUploadedBytes: 536_870_912
			});
		});
	});

	describe('testConnection', () => {
		it('returns pingOk: true with version on success', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify({ ok: true, version: '3.00 (bb6b5a062ef)' }), { status: 200 })
			);

			const result = await actions.testConnection({
				request: new Request('http://localhost/config', { method: 'POST' })
			} as never);

			expect((result as { pingOk?: boolean }).pingOk).toBe(true);
			expect((result as { version?: string }).version).toBe('3.00 (bb6b5a062ef)');
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/transmission/ping',
				expect.objectContaining({ method: 'POST' })
			);
		});

		it('returns fail(502) when Transmission is unreachable', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify({ ok: false, error: 'connection refused' }), { status: 502 })
			);

			const result = await actions.testConnection({
				request: new Request('http://localhost/config', { method: 'POST' })
			} as never);

			expect((result as { status?: number }).status).toBe(502);
			expect((result as { data?: { pingError?: string } }).data?.pingError).toContain(
				'connection refused'
			);
		});

		it('returns fail(403) when write token is not configured', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: {}
			}));
			const { actions } = await import('./+page.server');

			const result = await actions.testConnection({
				request: new Request('http://localhost/config', { method: 'POST' })
			} as never);

			expect((result as { status?: number }).status).toBe(403);
			expect((result as { data?: { pingError?: string } }).data?.pingError).toContain(
				'write token not configured'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});
	});

	describe('saveShows', () => {
		it('returns fail(400) when no show names provided', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');

			const result = await actions.saveShows({
				request: new Request('http://localhost/config', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { showsMessage?: string } }).data?.showsMessage).toContain(
				'At least one TV show name is required'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('returns fail(400) when ifMatch is missing', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('showName', 'Test Show');

			const result = await actions.saveShows({
				request: new Request('http://localhost/config', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { showsMessage?: string } }).data?.showsMessage).toContain(
				'Missing config revision'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('returns showsSuccess: true on happy path', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(null, { status: 200, headers: { etag: '"rev-2"' } })
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('showName', 'Breaking Bad');

			const result = await actions.saveShows({
				request: new Request('http://localhost/config', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { showsSuccess?: boolean }).showsSuccess).toBe(true);
			expect((result as { showsEtag?: string }).showsEtag).toBe('"rev-2"');
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/config',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ runtime: {}, tv: { shows: ['Breaking Bad'] } })
				})
			);
		});
	});

	describe('saveRuntime', () => {
		it('returns fail(400) when runtimeIfMatch is missing', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('runIntervalMinutes', '15');

			const result = await actions.saveRuntime({
				request: new Request('http://localhost/config', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { runtimeMessage?: string } }).data?.runtimeMessage).toContain(
				'Missing config revision'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('returns fail(400) on out-of-range runIntervalMinutes', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('runtimeIfMatch', '"rev-1"');
			body.set('runIntervalMinutes', '0');
			body.append('currentShow', 'Test Show');

			const result = await actions.saveRuntime({
				request: new Request('http://localhost/config', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { runtimeMessage?: string } }).data?.runtimeMessage).toContain(
				'runIntervalMinutes'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('returns runtimeSuccess: true on happy path with ETag update', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(null, { status: 200, headers: { etag: '"rev-2"' } })
			);

			const body = new URLSearchParams();
			body.set('runtimeIfMatch', '"rev-1"');
			body.set('runIntervalMinutes', '30');
			body.set('reconcileIntervalSeconds', '60');
			body.set('tmdbRefreshIntervalMinutes', '0');
			body.append('currentShow', 'Breaking Bad');
			body.append('currentShow', 'Better Call Saul');

			const result = await actions.saveRuntime({
				request: new Request('http://localhost/config', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { runtimeSuccess?: boolean }).runtimeSuccess).toBe(true);
			expect((result as { runtimeEtag?: string }).runtimeEtag).toBe('"rev-2"');
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/config',
				expect.objectContaining({
					method: 'PUT',
					body: expect.stringContaining('"shows":["Breaking Bad","Better Call Saul"]')
				})
			);
		});

		it('returns fail(400) when no currentShow values provided', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('runtimeIfMatch', '"rev-1"');
			body.set('runIntervalMinutes', '30');

			const result = await actions.saveRuntime({
				request: new Request('http://localhost/config', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { runtimeMessage?: string } }).data?.runtimeMessage).toContain(
				'Missing current TV shows'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});
	});

	describe('restartDaemon', () => {
		it('returns 401 when write token is not configured', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: {}
			}));
			const { actions } = await import('./+page.server');

			const result = await actions.restartDaemon({
				request: new Request('http://localhost/config', { method: 'POST' })
			} as never);

			expect((result as { status?: number }).status).toBe(401);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('returns 403 when write token is empty (writes disabled)', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: '' }
			}));
			const { actions } = await import('./+page.server');

			const result = await actions.restartDaemon({
				request: new Request('http://localhost/config', { method: 'POST' })
			} as never);

			expect((result as { status?: number }).status).toBe(403);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('returns restarted: true on success', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(new Response(null, { status: 202 }));

			const result = await actions.restartDaemon({
				request: new Request('http://localhost/config', { method: 'POST' })
			} as never);

			expect((result as { restarted?: boolean }).restarted).toBe(true);
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/daemon/restart',
				expect.objectContaining({ method: 'POST' })
			);
		});
	});
});
