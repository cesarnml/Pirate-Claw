import { apiFetch } from '$lib/server/api';
import type { AppConfig } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const config = await apiFetch<AppConfig>('/api/config');
		return { config, error: null };
	} catch {
		return { config: null as AppConfig | null, error: 'Could not reach the API.' };
	}
};
