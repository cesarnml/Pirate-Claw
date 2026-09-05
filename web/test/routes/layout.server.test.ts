import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const authStateRejection = vi
	.fn()
	.mockRejectedValue(new Error('auth state not available in layout tests'));
vi.mock('$lib/server/api', () => ({
	apiFetch: apiFetchMock,
	apiRequest: authStateRejection,
	// +layout.server.ts's load now calls the nav-scoped variants (short
	// timeout + retry — see api.ts's NAV_TIMEOUT_MS) rather than
	// apiFetch/apiRequest directly; alias them to the same mocks so this
	// suite's expectations still apply.
	navApiFetch: apiFetchMock,
	navApiRequest: authStateRejection
}));

const mockUser = { username: 'admin' };

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
					token: '[redacted]'
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

		const result = await load({
			locals: { user: mockUser },
			url: new URL('http://localhost:5173/')
		} as never);

		expect(result).toEqual({
			user: mockUser,
			// auth/state rejects in this test env (no write token) — an
			// unconfirmed trust check must not flag the origin as untrusted,
			// only a confirmed-absent one may (see +layout.server.ts).
			untrustedOrigin: null,
			networkPosture: null,
			config: {
				plex: {
					url: 'http://localhost:32400',
					token: '[redacted]'
				}
			},
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

	it('returns setupState=starter when setup/state reports starter (unauthenticated)', async () => {
		const { load } = await import('../../src/routes/+layout.server');

		// Unauthenticated: only /api/setup/state is fetched
		apiFetchMock.mockResolvedValueOnce({ state: 'starter' });

		const result = (await load({
			locals: { user: null },
			url: new URL('http://localhost:5173/')
		} as never)) as {
			setupState: string;
			readinessState: string;
		};
		expect(result.setupState).toBe('starter');
		// Readiness isn't fetched for an unauthenticated request — null
		// ("not confirmed"), not a defaulted 'not_ready' claim.
		expect(result.readinessState).toBe(null);
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
				plex: { url: 'http://localhost:32400', token: '' }
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

		const result = (await load({
			locals: { user: mockUser },
			url: new URL('http://localhost:5173/')
		} as never)) as { setupState: string };
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
				plex: { url: 'http://localhost:32400', token: '' }
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

		const result = (await load({
			locals: { user: mockUser },
			url: new URL('http://localhost:5173/')
		} as never)) as {
			readinessState: string;
		};
		expect(result.readinessState).toBe('not_ready');
	});

	it('tolerates unavailable shared endpoints and returns null (not a defaulted state) for setupState/readinessState — an unreachable API must not read as "confirmed incomplete"', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { load } = await import('../../src/routes/+layout.server');

			// For unauthenticated: only setup/state is fetched, and it rejects
			apiFetchMock.mockRejectedValueOnce(new Error('setup state down'));

			const result = await load({
				locals: { user: null },
				url: new URL('http://localhost:5173/')
			} as never);

			expect(result).toEqual({
				user: null,
				untrustedOrigin: null,
				networkPosture: null,
				config: null,
				health: null,
				transmissionSession: null,
				plexAuthState: 'unavailable',
				setupState: null,
				readinessState: null,
				installHealthState: null
			});
		} finally {
			errorSpy.mockRestore();
		}
	});
});
