import { describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

describe('config page server actions', () => {
	describe('saveSettings', () => {
		it('rejects out-of-scope fields before API call', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockReset();

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
			apiRequestMock.mockReset();

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
			vi.resetModules();
			const { actions } = await import('./+page.server');
			apiRequestMock.mockReset();

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
			vi.resetModules();
			const { actions } = await import('./+page.server');
			apiRequestMock.mockReset();

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
			vi.resetModules();
			const { actions } = await import('./+page.server');
			apiRequestMock.mockReset();
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
