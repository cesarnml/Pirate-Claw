import { apiFetch } from '$lib/server/api';
import type { DaemonHealth, SessionInfo } from '$lib/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const [healthResult, sessionResult] = await Promise.allSettled([
		apiFetch<DaemonHealth>('/api/health'),
		apiFetch<SessionInfo>('/api/transmission/session')
	]);

	if (healthResult.status === 'rejected') {
		console.error('[layout] failed to load /api/health:', healthResult.reason);
	}

	if (sessionResult.status === 'rejected') {
		console.error('[layout] failed to load /api/transmission/session:', sessionResult.reason);
	}

	return {
		health: healthResult.status === 'fulfilled' ? healthResult.value : null,
		transmissionSession: sessionResult.status === 'fulfilled' ? sessionResult.value : null
	};
};
