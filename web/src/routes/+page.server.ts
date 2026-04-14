import { env } from '$env/dynamic/private';
import { deriveOnboardingStatus } from '$lib/onboarding';
import { apiFetch } from '$lib/server/api';
import type {
	AppConfig,
	CandidateStateRecord,
	DaemonHealth,
	OnboardingStatus,
	SessionInfo,
	TorrentStatSnapshot
} from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;
	const [healthResult, sessionResult, torrentsResult, candidatesResult, configResult] =
		await Promise.allSettled([
			apiFetch<DaemonHealth>('/api/health'),
			apiFetch<SessionInfo>('/api/transmission/session'),
			apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents'),
			apiFetch<{ candidates: CandidateStateRecord[] }>('/api/candidates'),
			apiFetch<AppConfig>('/api/config')
		]);

	const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
	const transmissionSession = sessionResult.status === 'fulfilled' ? sessionResult.value : null;
	const transmissionTorrents =
		torrentsResult.status === 'fulfilled' ? torrentsResult.value.torrents : null;
	const candidates =
		candidatesResult.status === 'fulfilled' ? candidatesResult.value.candidates : null;
	const onboarding: OnboardingStatus | null =
		configResult.status === 'fulfilled'
			? deriveOnboardingStatus(configResult.value, canWrite)
			: null;

	const error = health === null ? 'Could not reach the API.' : null;

	if (health === null) {
		console.error('[dashboard] failed to load /api/health');
	}
	if (torrentsResult.status === 'rejected') {
		console.error('[dashboard] failed to load /api/transmission/torrents', torrentsResult.reason);
	}
	if (candidatesResult.status === 'rejected') {
		console.error('[dashboard] failed to load /api/candidates', candidatesResult.reason);
	}
	if (configResult.status === 'rejected') {
		console.error('[dashboard] failed to load /api/config', configResult.reason);
	}

	return {
		health,
		transmissionSession,
		transmissionTorrents,
		candidates,
		onboarding,
		error
	};
};
