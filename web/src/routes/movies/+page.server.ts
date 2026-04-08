import { apiFetch } from '$lib/server/api';
import type { MovieBreakdown } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const data = await apiFetch<{ movies: MovieBreakdown[] }>('/api/movies');
		return { movies: data.movies, error: null };
	} catch {
		return { movies: [] as MovieBreakdown[], error: 'Could not reach the API.' };
	}
};
