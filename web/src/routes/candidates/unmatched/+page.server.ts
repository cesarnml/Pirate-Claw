import { apiFetch } from '$lib/server/api';
import type { SkippedOutcomeRecord } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const data = await apiFetch<{ outcomes: SkippedOutcomeRecord[] }>(
			'/api/outcomes?status=skipped_no_match'
		);
		return { outcomes: data.outcomes, error: null };
	} catch (err) {
		console.error('[unmatched] failed to load /api/outcomes:', err);
		return {
			outcomes: [] as SkippedOutcomeRecord[],
			error: 'Could not reach the API.'
		};
	}
};
