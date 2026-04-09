import { apiFetch } from '$lib/server/api';
import type { ShowBreakdown } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const data = await apiFetch<{ shows: ShowBreakdown[] }>('/api/shows');
		return { shows: data.shows, error: null };
	} catch (err) {
		console.error('[shows list] failed to load /api/shows:', err);
		return {
			shows: [] as ShowBreakdown[],
			error: 'Could not reach the API.',
		};
	}
};
