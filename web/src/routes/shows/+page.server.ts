import { apiFetch, navApiFetch } from '$lib/server/api';
import type { ShowBreakdown, TorrentStatSnapshot } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [showsResult, torrentsResult] = await Promise.allSettled([
		// Stays on the full 60s budget, not the nav-blocking one — /api/shows
		// can legitimately chain TMDB calls that each eat ~15s of 429 backoff
		// (see api.ts's DEFAULT_TIMEOUT_MS comment); torrents has no such
		// excuse and gets the fail-fast+retry treatment.
		apiFetch<{ shows: ShowBreakdown[] }>('/api/shows'),
		navApiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents')
	]);

	if (showsResult.status === 'rejected') {
		console.error('[shows list] failed to load /api/shows:', showsResult.reason);
		return { shows: [] as ShowBreakdown[], torrents: null, error: 'Could not reach the API.' };
	}

	if (torrentsResult.status === 'rejected') {
		console.error('[shows list] failed to load /api/transmission/torrents:', torrentsResult.reason);
	}

	return {
		shows: showsResult.value.shows,
		torrents: torrentsResult.status === 'fulfilled' ? torrentsResult.value.torrents : null,
		error: null
	};
};
