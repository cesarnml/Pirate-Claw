import { apiFetch } from '$lib/server/api';
import type { ShowBreakdown } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const title = params.slug;
	try {
		const data = await apiFetch<{ shows: ShowBreakdown[] }>('/api/shows');
		const show = data.shows.find(
			(s) => s.normalizedTitle.toLowerCase() === title.toLowerCase(),
		) ?? null;
		return { show, error: null };
	} catch {
		return { show: null as ShowBreakdown | null, error: 'Could not reach the API.' };
	}
};

