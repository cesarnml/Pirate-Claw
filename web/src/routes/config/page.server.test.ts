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
								reconcileIntervalMinutes: 60,
								artifactDir: '/tmp',
								artifactRetentionDays: 7
							}
						}),
						{ status: 200 }
					)
				)
				.mockRejectedValueOnce(new Error('network error'));

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
								reconcileIntervalMinutes: 60,
								artifactDir: '/tmp',
								artifactRetentionDays: 7
							}
						}),
						{ status: 200 }
					)
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ version: '3.00 (bb6b5a062ef)' }), { status: 200 })
				);

			const result = await load({} as never);
			expect((result as { transmissionSession: unknown }).transmissionSession).toEqual({
				version: '3.00 (bb6b5a062ef)'
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

	describe('saveSettings', () => {
		it('rejects out-of-scope fields before API call', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('runIntervalMinutes', '15');
			body.set('feeds', '[]');

			const result = await actions.saveSettings({
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
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('showName', 'Test Show');
			body.set('runIntervalMinutes', '0');

			const result = await actions.saveSettings({
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
