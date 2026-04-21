import { apiFetch } from '$lib/server/api';
import type {
	AppConfig,
	DaemonHealth,
	ReadinessResponse,
	SessionInfo,
	SetupState
} from '$lib/types';
import type { LayoutServerLoad } from './$types';

function normalizeSetupState(state: unknown): SetupState {
	return state === 'starter' || state === 'partially_configured' || state === 'ready'
		? state
		: 'partially_configured';
}

export const load: LayoutServerLoad = async () => {
	const [healthResult, sessionResult, configResult, readinessResult] = await Promise.allSettled([
		apiFetch<DaemonHealth>('/api/health'),
		apiFetch<SessionInfo>('/api/transmission/session'),
		apiFetch<AppConfig>('/api/config'),
		apiFetch<ReadinessResponse>('/api/setup/readiness')
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

	if (readinessResult.status === 'rejected') {
		console.error('[layout] failed to load /api/setup/readiness:', readinessResult.reason);
	}

	const readiness = readinessResult.status === 'fulfilled' ? readinessResult.value : null;

	return {
		health: healthResult.status === 'fulfilled' ? healthResult.value : null,
		transmissionSession: sessionResult.status === 'fulfilled' ? sessionResult.value : null,
		plexConfigured: configResult.status === 'fulfilled' && configResult.value.plex !== undefined,
		setupState: normalizeSetupState(readiness?.configState),
		readinessState: readiness?.state ?? 'not_ready'
	};
};
