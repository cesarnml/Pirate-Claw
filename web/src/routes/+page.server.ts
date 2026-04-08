import { apiFetch } from '$lib/server/api';
import type { DaemonHealth, RunSummaryRecord } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const [health, status] = await Promise.all([
			apiFetch<DaemonHealth>('/api/health'),
			apiFetch<{ runs: RunSummaryRecord[] }>('/api/status'),
		]);
		return { health, runs: status.runs, error: null };
	} catch (err) {
		console.error('[dashboard] failed to load health/status:', err);
		return {
			health: null as DaemonHealth | null,
			runs: [] as RunSummaryRecord[],
			error: 'Could not reach the API.',
		};
	}
};
