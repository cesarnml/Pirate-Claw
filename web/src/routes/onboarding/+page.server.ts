import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { deriveOnboardingStatus } from '$lib/onboarding';
import { apiRequest } from '$lib/server/api';
import type { AppConfig, FeedConfig } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;

	try {
		const configResponse = await apiRequest('/api/config');
		if (!configResponse.ok) {
			console.error('[onboarding] failed to load /api/config');
			return {
				config: null,
				etag: null,
				canWrite,
				onboarding: null,
				error: 'Could not reach the API.'
			};
		}

		const config = (await configResponse.json()) as AppConfig;
		const etag = configResponse.headers.get('etag');
		return {
			config,
			etag,
			canWrite,
			onboarding: deriveOnboardingStatus(config, canWrite),
			error: null
		};
	} catch (error) {
		console.error('[onboarding] failed to load /api/config', error);
		return {
			config: null,
			etag: null,
			canWrite,
			onboarding: null,
			error: 'Could not reach the API.'
		};
	}
};

function parseExistingFeeds(raw: string | File | null): FeedConfig[] {
	if (raw === null) return [];
	try {
		const parsed = JSON.parse(String(raw));
		return Array.isArray(parsed) ? (parsed as FeedConfig[]) : [];
	} catch {
		return [];
	}
}

export const actions: Actions = {
	saveFeed: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { feedsMessage: 'Config writes are disabled.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { feedsMessage: 'Missing config revision. Reload and try again.' });
		}

		const existingFeeds = parseExistingFeeds(formData.get('existingFeedsJson'));
		const name = String(formData.get('feedName') ?? '').trim();
		const url = String(formData.get('feedUrl') ?? '').trim();
		const mediaType = String(formData.get('feedMediaType') ?? 'tv').trim();

		if (!name || !url) {
			return fail(400, { feedsMessage: 'Feed name and URL are required.' });
		}
		if (mediaType !== 'tv' && mediaType !== 'movie') {
			return fail(400, { feedsMessage: 'Feed type must be TV or Movie.' });
		}

		const feeds = [...existingFeeds, { name, url, mediaType }];

		try {
			const response = await apiRequest('/api/config/feeds', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify(feeds)
			});

			if (!response.ok) {
				let feedsMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) feedsMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					feedsMessage,
					feedsEtag: response.headers.get('etag')
				});
			}

			return {
				feedsSuccess: true,
				feedsMessage: 'Feed saved.',
				feedsEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[onboarding] saveFeed failed:', error);
			return fail(500, { feedsMessage: 'Could not save feed.' });
		}
	}
};
