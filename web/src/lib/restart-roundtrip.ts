import type { RestartStatus } from '$lib/types';

export type RestartRoundTripPhase = 'requested' | 'restarting' | 'back_online';

export async function loadRestartRoundTripPhase(
	requestId: string,
	fetchImpl: typeof fetch = fetch
): Promise<RestartRoundTripPhase> {
	try {
		const response = await fetchImpl('/api/daemon/restart-status', {
			method: 'GET',
			cache: 'no-store'
		});
		if (!response.ok) {
			return 'restarting';
		}

		const status = (await response.json()) as RestartStatus;
		if ('requestId' in status && status.requestId === requestId) {
			return status.state === 'back_online' ? 'back_online' : 'requested';
		}

		return 'restarting';
	} catch {
		return 'restarting';
	}
}
