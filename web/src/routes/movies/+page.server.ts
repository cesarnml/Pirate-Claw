import { apiFetch, navApiFetch } from '$lib/server/api';
import type { MovieBreakdown, TorrentStatSnapshot } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [moviesResult, torrentsResult] = await Promise.allSettled([
		// Stays on the full 60s budget, not the nav-blocking one — /api/movies
		// can legitimately chain TMDB calls (see api.ts's DEFAULT_TIMEOUT_MS
		// comment); torrents has no such excuse and gets the fail-fast+retry
		// treatment.
		apiFetch<{ movies: MovieBreakdown[] }>('/api/movies'),
		navApiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents')
	]);

	if (moviesResult.status === 'rejected') {
		console.error('[movies] failed to load /api/movies:', moviesResult.reason);
		return { movies: [] as MovieBreakdown[], torrents: null, error: 'Could not reach the API.' };
	}

	if (torrentsResult.status === 'rejected') {
		console.error('[movies] failed to load /api/transmission/torrents:', torrentsResult.reason);
	}

	return {
		movies: moviesResult.value.movies,
		torrents: torrentsResult.status === 'fulfilled' ? torrentsResult.value.torrents : null,
		error: null
	};
};
