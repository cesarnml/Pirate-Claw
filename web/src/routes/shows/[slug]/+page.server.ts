import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { apiFetch, apiRequest } from '$lib/server/api';
import type { ShowBreakdown, TorrentStatSnapshot } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const title = params.slug;
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;

	const [showsResult, torrentsResult] = await Promise.allSettled([
		apiFetch<{ shows: ShowBreakdown[] }>('/api/shows'),
		apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents')
	]);

	if (showsResult.status === 'rejected') {
		console.error('[shows detail] failed to load /api/shows:', showsResult.reason);
		return {
			show: null as ShowBreakdown | null,
			torrents: null,
			error: 'Could not reach the API.',
			canWrite
		};
	}

	if (torrentsResult.status === 'rejected') {
		console.error(
			'[shows detail] failed to load /api/transmission/torrents:',
			torrentsResult.reason
		);
	}

	const show =
		showsResult.value.shows.find(
			(entry) => entry.normalizedTitle.toLowerCase() === title.toLowerCase()
		) ?? null;

	return {
		show,
		torrents: torrentsResult.status === 'fulfilled' ? torrentsResult.value.torrents : null,
		error: null,
		canWrite
	};
};

export const actions: Actions = {
	refreshTmdb: async ({ params }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { refreshMessage: 'TMDB refresh is unavailable without API write access.' });
		}

		try {
			const response = await apiRequest(
				`/api/shows/${encodeURIComponent(params.slug)}/tmdb/refresh`,
				{
					method: 'POST',
					headers: {
						authorization: `Bearer ${writeToken}`
					}
				}
			);

			if (!response.ok) {
				let refreshMessage = `Refresh failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) refreshMessage = body.error;
				} catch {
					// Keep fallback message.
				}
				return fail(response.status, { refreshMessage });
			}

			return {
				refreshSuccess: true,
				refreshMessage: 'TMDB metadata refreshed.'
			};
		} catch (error) {
			console.error('[shows detail] refreshTmdb failed:', error);
			return fail(500, { refreshMessage: 'Could not refresh TMDB metadata.' });
		}
	}
};
