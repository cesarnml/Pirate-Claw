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
		const { load } = await import('./+layout.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({
				version: '3.0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				activeTorrentCount: 0
			})
			.mockResolvedValueOnce({
				plex: {
					url: 'http://localhost:32400',
					token: '[redacted]',
					refreshIntervalMinutes: 30
				}
			})
			.mockResolvedValueOnce({ state: 'ready' });

		const result = await load({} as never);

		expect(result).toEqual({
			health: { uptime: 1, startedAt: '2024-01-01T00:00:00Z' },
			transmissionSession: {
				version: '3.0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				activeTorrentCount: 0
			},
			plexConfigured: true,
			setupState: 'ready'
		});
	});

	it('returns setupState=starter when setup/state reports starter', async () => {
		const { load } = await import('./+layout.server');

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
			.mockResolvedValueOnce({ state: 'starter' });

		const result = (await load({} as never)) as { setupState: string };
		expect(result.setupState).toBe('starter');
	});

	it('normalizes unknown setup state values to partially_configured', async () => {
		const { load } = await import('./+layout.server');

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
			.mockResolvedValueOnce({ state: 'mystery' });

		const result = (await load({} as never)) as { setupState: string };
		expect(result.setupState).toBe('partially_configured');
	});

	it('tolerates unavailable shared endpoints and returns nulls', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { load } = await import('./+layout.server');

			apiFetchMock
				.mockRejectedValueOnce(new Error('health down'))
				.mockRejectedValueOnce(new Error('tx down'))
				.mockRejectedValueOnce(new Error('config down'))
				.mockRejectedValueOnce(new Error('setup down'));

			const result = await load({} as never);

			expect(result).toEqual({
				health: null,
				transmissionSession: null,
				plexConfigured: false,
				setupState: 'partially_configured'
			});
		} finally {
			errorSpy.mockRestore();
		}
	});
});
