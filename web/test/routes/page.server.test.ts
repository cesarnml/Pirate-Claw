import { beforeEach, describe, expect, it, vi } from 'vitest';
import emptyConfig from '../../../fixtures/api/config-empty.json';
import feedOnlyConfig from '../../../fixtures/api/config-feed-only.json';

const apiFetchMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiFetch: apiFetchMock,
	// The dashboard load now calls navApiFetch (short timeout + retry — see
	// api.ts's NAV_TIMEOUT_MS) rather than apiFetch directly; alias it to
	// the same mock so this suite's expectations still apply.
	navApiFetch: apiFetchMock
}));

describe('dashboard page server load', () => {
	beforeEach(() => {
		apiFetchMock.mockReset();
		vi.resetModules();
	});

	it('derives initial_empty onboarding state for a strict empty config', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { load } = await import('../../src/routes/+page.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce(emptyConfig)
			.mockResolvedValueOnce({ version: '4.0.0' })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const result = await load({} as never);
		expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
			'initial_empty'
		);
		expect(
			apiFetchMock.mock.calls.some((args) => args[0] === '/api/outcomes?status=failed_enqueue')
		).toBe(true);
	});

	it('derives partial_setup onboarding state for feed-only config', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { load } = await import('../../src/routes/+page.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce(feedOnlyConfig)
			.mockResolvedValueOnce({ version: '4.0.0' })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const result = await load({} as never);
		expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
			'partial_setup'
		);
	});

	it('derives writes_disabled onboarding state when config is empty and writes are disabled', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: '' }
		}));
		const { load } = await import('../../src/routes/+page.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce(emptyConfig)
			.mockResolvedValueOnce({ version: '4.0.0' })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const result = await load({} as never);
		expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
			'writes_disabled'
		);
	});

	it('falls back to the last successful value instead of nulling a field on a failed background refresh', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { load } = await import('../../src/routes/+page.server');

		const torrents = [{ hash: 'abc', name: 'Some Show S01E01' }];
		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({ torrents })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce(emptyConfig)
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const first = await load({} as never);
		expect((first as { transmissionTorrents: unknown[] | null }).transmissionTorrents).toEqual(
			torrents
		);

		// A poll-triggered refresh: every call succeeds except torrents, which
		// times out. The stale-but-good torrent list must survive, not be
		// wiped to null (dashboard-load-path review, roadmap item #1).
		apiFetchMock
			.mockResolvedValueOnce({ uptime: 2, startedAt: '2024-01-01T00:00:00Z' })
			.mockRejectedValueOnce(new Error('timed out after 12000ms'))
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce(emptyConfig)
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const second = await load({} as never);
		expect((second as { transmissionTorrents: unknown[] | null }).transmissionTorrents).toEqual(
			torrents
		);
		expect((second as { error: string | null }).error).toBeNull();
	});
});
