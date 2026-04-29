import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiFetch: apiFetchMock
}));

describe('layout server load', () => {
	beforeEach(() => {
		apiFetchMock.mockReset();
		vi.resetModules();
	});

	it('returns shared daemon and transmission data when both endpoints succeed', async () => {
		const { load } = await import('../../src/routes/+layout.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({
				version: '3.0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				activeTorrentCount: 0,
				cumulativeDownloadedBytes: 0,
				cumulativeUploadedBytes: 0,
				currentDownloadedBytes: 0,
				currentUploadedBytes: 0
			})
			.mockResolvedValueOnce({
				plex: {
					url: 'http://localhost:32400',
					token: '[redacted]',
					refreshIntervalMinutes: 30
				}
			})
			.mockResolvedValueOnce({ state: 'ready' })
			.mockResolvedValueOnce({
				state: 'ready',
				configState: 'ready',
				transmissionReachable: true,
				daemonLive: true
			})
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				state: 'connected',
				plexUrl: 'http://localhost:32400',
				hasToken: true,
				tokenSource: 'config',
				returnTo: null
			});

		const result = await load({ locals: { user: null } } as never);

		expect(result).toEqual({
			user: null,
			health: { uptime: 1, startedAt: '2024-01-01T00:00:00Z' },
			transmissionSession: {
				version: '3.0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				activeTorrentCount: 0,
				cumulativeDownloadedBytes: 0,
				cumulativeUploadedBytes: 0,
				currentDownloadedBytes: 0,
				currentUploadedBytes: 0
			},
			plexAuthState: 'connected',
			setupState: 'ready',
			readinessState: 'ready',
			installHealthState: null
		});
	});

	it('returns setupState=starter when readiness reports starter configState', async () => {
		const { load } = await import('../../src/routes/+layout.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({
				version: '3.0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				activeTorrentCount: 0
			})
			.mockResolvedValueOnce({
				plex: { url: 'http://localhost:32400', token: '', refreshIntervalMinutes: 30 }
			})
			.mockResolvedValueOnce({ state: 'starter' })
			.mockResolvedValueOnce({
				state: 'not_ready',
				configState: 'starter',
				transmissionReachable: false,
				daemonLive: true
			})
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				state: 'connected',
				plexUrl: 'http://localhost:32400',
				hasToken: true,
				tokenSource: 'config',
				returnTo: null
			});

		const result = (await load({ locals: { user: null } } as never)) as {
			setupState: string;
			readinessState: string;
		};
		expect(result.setupState).toBe('starter');
		expect(result.readinessState).toBe('not_ready');
	});

	it('normalizes unknown configState values to partially_configured', async () => {
		const { load } = await import('../../src/routes/+layout.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({
				version: '3.0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				activeTorrentCount: 0
			})
			.mockResolvedValueOnce({
				plex: { url: 'http://localhost:32400', token: '', refreshIntervalMinutes: 30 }
			})
			.mockResolvedValueOnce({ state: 'partially_configured' })
			.mockResolvedValueOnce({
				state: 'not_ready',
				configState: 'mystery',
				transmissionReachable: false,
				daemonLive: true
			})
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				state: 'connected',
				plexUrl: 'http://localhost:32400',
				hasToken: true,
				tokenSource: 'config',
				returnTo: null
			});

		const result = (await load({ locals: { user: null } } as never)) as { setupState: string };
		expect(result.setupState).toBe('partially_configured');
	});

	it('normalizes unknown readinessState values to not_ready', async () => {
		const { load } = await import('../../src/routes/+layout.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({
				version: '3.0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				activeTorrentCount: 0
			})
			.mockResolvedValueOnce({
				plex: { url: 'http://localhost:32400', token: '', refreshIntervalMinutes: 30 }
			})
			.mockResolvedValueOnce({ state: 'ready' })
			.mockResolvedValueOnce({
				state: 'mystery',
				configState: 'ready',
				transmissionReachable: true,
				daemonLive: true
			})
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				state: 'connected',
				plexUrl: 'http://localhost:32400',
				hasToken: true,
				tokenSource: 'config',
				returnTo: null
			});

		const result = (await load({ locals: { user: null } } as never)) as { readinessState: string };
		expect(result.readinessState).toBe('not_ready');
	});

	it('tolerates unavailable shared endpoints and returns nulls', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { load } = await import('../../src/routes/+layout.server');

			apiFetchMock
				.mockRejectedValueOnce(new Error('health down'))
				.mockRejectedValueOnce(new Error('tx down'))
				.mockRejectedValueOnce(new Error('config down'))
				.mockRejectedValueOnce(new Error('setup state down'))
				.mockRejectedValueOnce(new Error('readiness down'))
				.mockRejectedValueOnce(new Error('install health down'))
				.mockRejectedValueOnce(new Error('plex auth down'));

			const result = await load({ locals: { user: null } } as never);

			expect(result).toEqual({
				user: null,
				health: null,
				transmissionSession: null,
				plexAuthState: 'unavailable',
				setupState: 'partially_configured',
				readinessState: 'not_ready',
				installHealthState: null
			});
		} finally {
			errorSpy.mockRestore();
		}
	});
});
