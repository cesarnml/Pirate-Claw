import { apiFetch } from '$lib/server/api';
import type {
	AppConfig,
	DaemonHealth,
	InstallHealthResponse,
	PlexAuthState,
	PlexAuthStatusResponse,
	ReadinessResponse,
	ReadinessState,
	SessionInfo,
	SetupState
} from '$lib/types';
import type { LayoutServerLoad } from './$types';

function normalizeSetupState(state: unknown): SetupState {
	return state === 'starter' || state === 'partially_configured' || state === 'ready'
		? state
		: 'partially_configured';
}

function normalizeReadinessState(state: unknown): ReadinessState {
	return state === 'not_ready' || state === 'ready_pending_restart' || state === 'ready'
		? state
		: 'not_ready';
}

function normalizePlexAuthState(
	configHasPlex: boolean,
	authState: PlexAuthState | undefined
): PlexAuthState | 'unavailable' {
	if (!configHasPlex) return 'unavailable';
	return authState ?? 'not_connected';
}

export const load: LayoutServerLoad = async ({ locals }) => {
	// Skip sensitive API fetches for unauthenticated requests (auth pages: /setup, /login)
	const authenticated = locals.user !== null;

	const [
		healthResult,
		sessionResult,
		configResult,
		setupStateResult,
		readinessResult,
		installHealthResult,
		plexAuthResult
	] = await Promise.allSettled([
		authenticated ? apiFetch<DaemonHealth>('/api/health') : Promise.reject('unauthenticated'),
		authenticated
			? apiFetch<SessionInfo>('/api/transmission/session')
			: Promise.reject('unauthenticated'),
		authenticated ? apiFetch<AppConfig>('/api/config') : Promise.reject('unauthenticated'),
		apiFetch<{ state: SetupState }>('/api/setup/state'),
		authenticated
			? apiFetch<ReadinessResponse>('/api/setup/readiness')
			: Promise.reject('unauthenticated'),
		authenticated
			? apiFetch<InstallHealthResponse>('/api/setup/install-health')
			: Promise.reject('unauthenticated'),
		authenticated
			? apiFetch<PlexAuthStatusResponse>('/api/plex/auth/status')
			: Promise.reject('unauthenticated')
	]);

	if (authenticated && healthResult.status === 'rejected') {
		console.error('[layout] failed to load /api/health:', healthResult.reason);
	}

	if (authenticated && sessionResult.status === 'rejected') {
		console.error('[layout] failed to load /api/transmission/session:', sessionResult.reason);
	}

	if (authenticated && configResult.status === 'rejected') {
		console.error('[layout] failed to load /api/config:', configResult.reason);
	}

	if (setupStateResult.status === 'rejected') {
		console.error('[layout] failed to load /api/setup/state:', setupStateResult.reason);
	}

	if (authenticated && readinessResult.status === 'rejected') {
		console.error('[layout] failed to load /api/setup/readiness:', readinessResult.reason);
	}

	if (authenticated && installHealthResult.status === 'rejected') {
		console.error('[layout] failed to load /api/setup/install-health:', installHealthResult.reason);
	}

	if (authenticated && plexAuthResult.status === 'rejected') {
		console.error('[layout] failed to load /api/plex/auth/status:', plexAuthResult.reason);
	}

	const readiness = readinessResult.status === 'fulfilled' ? readinessResult.value : null;
	const setupState = setupStateResult.status === 'fulfilled' ? setupStateResult.value.state : null;
	const configHasPlex =
		configResult.status === 'fulfilled' && configResult.value.plex !== undefined;
	const plexAuthState =
		plexAuthResult.status === 'fulfilled' ? plexAuthResult.value.state : undefined;

	return {
		user: locals.user ?? null,
		health: healthResult.status === 'fulfilled' ? healthResult.value : null,
		transmissionSession: sessionResult.status === 'fulfilled' ? sessionResult.value : null,
		plexAuthState: normalizePlexAuthState(configHasPlex, plexAuthState),
		setupState: normalizeSetupState(setupState),
		readinessState: normalizeReadinessState(readiness?.state),
		installHealthState:
			installHealthResult.status === 'fulfilled' ? installHealthResult.value : null
	};
};
