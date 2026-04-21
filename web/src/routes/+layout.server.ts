import { apiFetch } from '$lib/server/api';
import type { AppConfig, DaemonHealth, SessionInfo } from '$lib/types';
import type { LayoutServerLoad } from './$types';

type SetupStateResponse = { state: 'starter' | 'partially_configured' | 'ready' };

function normalizeSetupState(state: unknown): SetupStateResponse['state'] {
	return state === 'starter' || state === 'partially_configured' || state === 'ready'
		? state
		: 'partially_configured';
}

export const load: LayoutServerLoad = async () => {
	const [healthResult, sessionResult, configResult, setupStateResult] = await Promise.allSettled([
		apiFetch<DaemonHealth>('/api/health'),
		apiFetch<SessionInfo>('/api/transmission/session'),
		apiFetch<AppConfig>('/api/config'),
		apiFetch<SetupStateResponse>('/api/setup/state')
	]);

	if (healthResult.status === 'rejected') {
		console.error('[layout] failed to load /api/health:', healthResult.reason);
	}

	if (sessionResult.status === 'rejected') {
		console.error('[layout] failed to load /api/transmission/session:', sessionResult.reason);
	}

	if (configResult.status === 'rejected') {
		console.error('[layout] failed to load /api/config:', configResult.reason);
	}

	if (setupStateResult.status === 'rejected') {
		console.error('[layout] failed to load /api/setup/state:', setupStateResult.reason);
	}

	return {
		health: healthResult.status === 'fulfilled' ? healthResult.value : null,
		transmissionSession: sessionResult.status === 'fulfilled' ? sessionResult.value : null,
		plexConfigured: configResult.status === 'fulfilled' && configResult.value.plex !== undefined,
		setupState:
			setupStateResult.status === 'fulfilled'
				? normalizeSetupState(setupStateResult.value.state)
				: 'partially_configured'
	};
};
