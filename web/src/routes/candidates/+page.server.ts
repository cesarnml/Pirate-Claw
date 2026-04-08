import { apiFetch } from '$lib/server/api';
import type { CandidateStateRecord } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const data = await apiFetch<{ candidates: CandidateStateRecord[] }>('/api/candidates');
		return { candidates: data.candidates, error: null };
	} catch {
		return { candidates: [] as CandidateStateRecord[], error: 'Could not reach the API.' };
	}
};
