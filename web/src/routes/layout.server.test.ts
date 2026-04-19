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
			});

		const result = await load({} as never);

		expect(result).toEqual({
			health: { uptime: 1, startedAt: '2024-01-01T00:00:00Z' },
			transmissionSession: {
				version: '3.0',
				downloadSpeed: 0,
				uploadSpeed: 0,
				activeTorrentCount: 0
			}
		});
	});

	it('tolerates unavailable shared endpoints and returns nulls', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { load } = await import('./+layout.server');

			apiFetchMock
				.mockRejectedValueOnce(new Error('health down'))
				.mockRejectedValueOnce(new Error('tx down'));

			const result = await load({} as never);

			expect(result).toEqual({
				health: null,
				transmissionSession: null
			});
		} finally {
			errorSpy.mockRestore();
		}
	});
});
