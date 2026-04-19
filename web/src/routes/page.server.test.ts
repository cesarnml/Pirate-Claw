import { beforeEach, describe, expect, it, vi } from 'vitest';
import emptyConfig from '../../../fixtures/api/config-empty.json';
import feedOnlyConfig from '../../../fixtures/api/config-feed-only.json';

const apiFetchMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiFetch: apiFetchMock
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
		const { load } = await import('./+page.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce(emptyConfig);

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
		const { load } = await import('./+page.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce(feedOnlyConfig);

		const result = await load({} as never);
		expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
			'partial_setup'
		);
	});

	it('derives writes_disabled onboarding state when config is empty and writes are disabled', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: '' }
		}));
		const { load } = await import('./+page.server');

		apiFetchMock
			.mockResolvedValueOnce({ uptime: 1, startedAt: '2024-01-01T00:00:00Z' })
			.mockResolvedValueOnce({ torrents: [] })
			.mockResolvedValueOnce({ candidates: [] })
			.mockResolvedValueOnce({ runs: [] })
			.mockResolvedValueOnce({ outcomes: [] })
			.mockResolvedValueOnce(emptyConfig);

		const result = await load({} as never);
		expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
			'writes_disabled'
		);
	});
});
