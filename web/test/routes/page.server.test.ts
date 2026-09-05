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

vi.mock('$lib/server/request-context', () => ({
	currentRequestId: () => 'test-req-id'
}));

/** health/config are no longer fetched by +page.server.ts's own load() —
 * they come from +layout.server.ts via parent() (roadmap item #5, dashboard-
 * load-path review). This stands in for SvelteKit's real parent(). */
function fakeParent(health: unknown, config: unknown) {
	return async () => ({ health, config });
}

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
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const result = await load({
			parent: fakeParent({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' }, emptyConfig)
		} as never);
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
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const result = await load({
			parent: fakeParent({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' }, feedOnlyConfig)
		} as never);
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
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const result = await load({
			parent: fakeParent({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' }, emptyConfig)
		} as never);
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
			.mockResolvedValueOnce({ torrents })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const first = await load({
			parent: fakeParent({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' }, emptyConfig)
		} as never);
		expect((first as { transmissionTorrents: unknown[] | null }).transmissionTorrents).toEqual(
			torrents
		);

		// A poll-triggered refresh: every call succeeds except torrents, which
		// times out. The stale-but-good torrent list must survive, not be
		// wiped to null (dashboard-load-path review, roadmap item #1).
		apiFetchMock
			.mockRejectedValueOnce(new Error('timed out after 12000ms'))
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		const second = await load({
			parent: fakeParent({ uptime: 2, startedAt: '2024-01-01T00:00:00Z' }, emptyConfig)
		} as never);
		expect((second as { transmissionTorrents: unknown[] | null }).transmissionTorrents).toEqual(
			torrents
		);
		expect((second as { error: string | null }).error).toBeNull();
	});

	it('does not blank the page when only /api/health fails and other calls have data (roadmap item #2)', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { load } = await import('../../src/routes/+page.server');

		const candidates = [{ id: 1, title: 'Some Show S01E01' }];
		apiFetchMock
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({ items: [] });

		// The layout's own /api/health fetch failed — parent() surfaces that
		// as health: null, same as before this used its own navApiFetch call.
		const result = await load({ parent: fakeParent(null, emptyConfig) } as never);
		expect((result as { error: string | null }).error).toBeNull();
		expect((result as { candidates: unknown[] | null }).candidates).toEqual(candidates);
		expect((result as { health: unknown }).health).toBeNull();
	});

	it('blanks the page when everything but the config fetch fails, even though onboarding resolves', async () => {
		// /api/config is the cheapest call and near-certain to succeed even
		// during a real outage — it must not count toward the quorum that
		// keeps the error gate closed (roadmap item #2 follow-up).
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { load } = await import('../../src/routes/+page.server');

		apiFetchMock
			.mockRejectedValueOnce(new Error('timed out after 12000ms')) // torrents
			.mockRejectedValueOnce(new Error('timed out after 12000ms')) // candidates
			.mockRejectedValueOnce(new Error('timed out after 12000ms')) // status
			.mockRejectedValueOnce(new Error('timed out after 12000ms')) // outcomes
			.mockRejectedValueOnce(new Error('timed out after 12000ms')) // manual-grabs/completed
			.mockRejectedValueOnce(new Error('timed out after 12000ms')); // manual-grabs/tracked

		// health fails; config (from the layout) succeeds.
		const result = await load({ parent: fakeParent(null, emptyConfig) } as never);
		expect((result as { error: string | null }).error).toBe('Could not reach the API.');
		expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
			'initial_empty'
		);
	});

	it('blanks the page on a genuine first-load outage where every call fails', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { load } = await import('../../src/routes/+page.server');

		apiFetchMock.mockRejectedValue(new Error('timed out after 12000ms'));

		// The layout's own health and config fetches failed too.
		const result = await load({ parent: fakeParent(null, null) } as never);
		expect((result as { error: string | null }).error).toBe('Could not reach the API.');
	});
});
