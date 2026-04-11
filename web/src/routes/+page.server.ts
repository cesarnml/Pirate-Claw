import { apiFetch } from '$lib/server/api';
import type {
	CandidateStateRecord,
	DaemonHealth,
	SessionInfo,
	TorrentStatSnapshot
} from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [healthResult, sessionResult, torrentsResult, candidatesResult] = await Promise.allSettled([
		apiFetch<DaemonHealth>('/api/health'),
		apiFetch<SessionInfo>('/api/transmission/session'),
		apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents'),
		apiFetch<{ candidates: CandidateStateRecord[] }>('/api/candidates')
	]);

	const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
	const transmissionSession = sessionResult.status === 'fulfilled' ? sessionResult.value : null;
	const transmissionTorrents =
		torrentsResult.status === 'fulfilled' ? torrentsResult.value.torrents : null;
	const candidates =
		candidatesResult.status === 'fulfilled' ? candidatesResult.value.candidates : null;

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

	return {
		health,
		transmissionSession,
		transmissionTorrents,
		candidates,
		error
	};
};
