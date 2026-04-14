import { beforeEach, describe, expect, it, vi } from 'vitest';
import emptyConfig from '../../../../fixtures/api/config-empty.json';
import feedOnlyConfig from '../../../../fixtures/api/config-feed-only.json';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

describe('onboarding page server', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
	});

	describe('load', () => {
		it('returns writes_disabled onboarding state when writes are unavailable', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: '' }
			}));
			const { load } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(new Response(JSON.stringify(emptyConfig), { status: 200 }));

			const result = await load({} as never);
			expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
				'writes_disabled'
			);
		});

		it('returns initial_empty onboarding state for strict empty config', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify(emptyConfig), { status: 200, headers: { etag: '"rev-1"' } })
			);

			const result = await load({} as never);
			expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
				'initial_empty'
			);
		});

		it('returns partial_setup onboarding state for feed-only config', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { load } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify(feedOnlyConfig), { status: 200, headers: { etag: '"rev-2"' } })
			);

			const result = await load({} as never);
			expect((result as { onboarding: { state: string } | null }).onboarding?.state).toBe(
				'partial_setup'
			);
		});
	});

	describe('saveFeed', () => {
		it('returns fail(400) when ifMatch is missing', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');

			const body = new URLSearchParams();
			body.set('feedName', 'TV Feed');
			body.set('feedUrl', 'https://example.com/feed.rss');
			body.set('feedMediaType', 'tv');

			const result = await actions.saveFeed({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { feedsMessage?: string } }).data?.feedsMessage).toContain(
				'Missing config revision'
			);
			expect(apiRequestMock).not.toHaveBeenCalled();
		});

		it('passes validation failures through from the feeds endpoint', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(JSON.stringify({ error: 'Feed URL failed validation.' }), {
					status: 400,
					headers: { etag: '"rev-2"' }
				})
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('feedName', 'TV Feed');
			body.set('feedUrl', 'https://example.com/feed.rss');
			body.set('feedMediaType', 'tv');
			body.set('existingFeedsJson', JSON.stringify([]));

			const result = await actions.saveFeed({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { status?: number }).status).toBe(400);
			expect((result as { data?: { feedsMessage?: string } }).data?.feedsMessage).toContain(
				'Feed URL failed validation'
			);
		});

		it('returns feedsSuccess with fresh etag on happy path', async () => {
			vi.doMock('$env/dynamic/private', () => ({
				env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
			}));
			const { actions } = await import('./+page.server');
			apiRequestMock.mockResolvedValue(
				new Response(null, { status: 200, headers: { etag: '"rev-2"' } })
			);

			const body = new URLSearchParams();
			body.set('ifMatch', '"rev-1"');
			body.set('feedName', 'TV Feed');
			body.set('feedUrl', 'https://example.com/feed.rss');
			body.set('feedMediaType', 'tv');
			body.set('existingFeedsJson', JSON.stringify([]));

			const result = await actions.saveFeed({
				request: new Request('http://localhost/onboarding', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			} as never);

			expect((result as { feedsSuccess?: boolean }).feedsSuccess).toBe(true);
			expect((result as { feedsEtag?: string }).feedsEtag).toBe('"rev-2"');
			expect(apiRequestMock).toHaveBeenCalledWith(
				'/api/config/feeds',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify([
						{
							name: 'TV Feed',
							url: 'https://example.com/feed.rss',
							mediaType: 'tv'
						}
					])
				})
			);
		});
	});
});
