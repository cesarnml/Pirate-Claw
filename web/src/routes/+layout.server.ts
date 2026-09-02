import { navApiRequest, navApiFetch } from '$lib/server/api';
import type {
	AppConfig,
	AuthStateResult,
	DaemonHealth,
	InstallHealthResponse,
	NetworkPostureState,
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

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Skip sensitive API fetches for unauthenticated requests (auth pages: /setup, /login)
	const authenticated = locals.user !== null;
	const writeToken = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	const authStateFetch: Promise<AuthStateResult> =
		authenticated && writeToken
			? navApiRequest('/api/auth/state', {
					headers: { Authorization: `Bearer ${writeToken}` }
				}).then(async (res) => {
					if (!res.ok) throw new Error(`auth/state ${res.status}`);
					return res.json() as Promise<AuthStateResult>;
				})
			: Promise.reject(new Error('unauthenticated'));

	const [
		healthResult,
		sessionResult,
		configResult,
		setupStateResult,
		readinessResult,
		installHealthResult,
		plexAuthResult,
		authStateResult
	] = await Promise.allSettled([
		authenticated ? navApiFetch<DaemonHealth>('/api/health') : Promise.reject('unauthenticated'),
		authenticated
			? navApiFetch<SessionInfo>('/api/transmission/session')
			: Promise.reject('unauthenticated'),
		authenticated ? navApiFetch<AppConfig>('/api/config') : Promise.reject('unauthenticated'),
		navApiFetch<{ state: SetupState }>('/api/setup/state'),
		authenticated
			? navApiFetch<ReadinessResponse>('/api/setup/readiness')
			: Promise.reject('unauthenticated'),
		authenticated
			? navApiFetch<InstallHealthResponse>('/api/setup/install-health')
			: Promise.reject('unauthenticated'),
		authenticated
			? navApiFetch<PlexAuthStatusResponse>('/api/plex/auth/status')
			: Promise.reject('unauthenticated'),
		authStateFetch
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
	// null (not a coerced default) whenever the fetch itself failed — the
	// daemon being unreachable is not evidence that setup is incomplete, and
	// defaulting to a definite state here used to make the onboarding banner
	// fire off a plain API outage. See +layout.svelte for how null is
	// treated (no banner, since nothing was actually confirmed).
	const setupState =
		setupStateResult.status === 'fulfilled'
			? normalizeSetupState(setupStateResult.value.state)
			: null;
	const readinessState = readiness ? normalizeReadinessState(readiness.state) : null;
	const configHasPlex =
		configResult.status === 'fulfilled' && configResult.value.plex !== undefined;
	const plexAuthState =
		plexAuthResult.status === 'fulfilled' ? plexAuthResult.value.state : undefined;
	const authState = authStateResult.status === 'fulfilled' ? authStateResult.value : null;
	const trustedOrigins = authState?.trusted_origins ?? [];
	const requestOrigin = url.origin;
	// A failed /api/auth/state means "we couldn't ask the daemon what's
	// trusted," not "the daemon confirmed this origin isn't" — showing the
	// trust-origin banner off an empty trustedOrigins fallback would flag
	// every origin as untrusted the moment the API is merely unreachable.
	// Only a *successful* fetch that genuinely omits this origin counts.
	const untrustedOrigin: string | null =
		locals.user && authStateResult.status === 'fulfilled' && !trustedOrigins.includes(requestOrigin)
			? requestOrigin
			: null;
	const networkPosture: NetworkPostureState | null = authState?.network_posture ?? null;

	if (untrustedOrigin) {
		console.log('[layout] untrusted origin detected:', untrustedOrigin, '— trust banner will show');
	}
	if (networkPosture === 'unacknowledged') {
		console.log('[layout] network posture unacknowledged:', networkPosture);
	}
	if (authStateResult.status === 'rejected') {
		console.warn('[layout] auth state unavailable:', authStateResult.reason);
	}
	console.log(
		`[layout] load complete — user=${locals.user?.username ?? 'none'} setupState=${setupState} readiness=${readiness?.state ?? 'unknown'} untrustedOrigin=${untrustedOrigin ?? 'none'} networkPosture=${networkPosture ?? 'unknown'}`
	);

	return {
		user: locals.user ?? null,
		health: healthResult.status === 'fulfilled' ? healthResult.value : null,
		transmissionSession: sessionResult.status === 'fulfilled' ? sessionResult.value : null,
		plexAuthState: normalizePlexAuthState(configHasPlex, plexAuthState),
		setupState,
		readinessState,
		installHealthState:
			installHealthResult.status === 'fulfilled' ? installHealthResult.value : null,
		untrustedOrigin,
		networkPosture
	};
};
