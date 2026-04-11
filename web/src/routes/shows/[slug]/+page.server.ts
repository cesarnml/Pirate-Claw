import { apiFetch } from '$lib/server/api';
import type { ShowBreakdown, TorrentStatSnapshot } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const title = params.slug;

	const [showsResult, torrentsResult] = await Promise.allSettled([
		apiFetch<{ shows: ShowBreakdown[] }>('/api/shows'),
		apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents')
	]);

	if (showsResult.status === 'rejected') {
		console.error('[shows detail] failed to load /api/shows:', showsResult.reason);
		return {
			show: null as ShowBreakdown | null,
			torrents: null,
			error: 'Could not reach the API.'
		};
	}

	if (torrentsResult.status === 'rejected') {
		console.error(
			'[shows detail] failed to load /api/transmission/torrents:',
			torrentsResult.reason
		);
	}

	const show =
		showsResult.value.shows.find((s) => s.normalizedTitle.toLowerCase() === title.toLowerCase()) ??
		null;

	return {
		show,
		torrents: torrentsResult.status === 'fulfilled' ? torrentsResult.value.torrents : null,
		error: null
	};
};
