import type { RestartStatus } from '$lib/types';

export const RESTART_RETURN_TIMEOUT_MS = 45_000;

export type RestartRoundTripPhase = 'requested' | 'restarting' | 'back_online' | 'failed_to_return';

export function hasRestartTimedOut(
	requestedAt: string,
	nowMs: number = Date.now(),
	timeoutMs: number = RESTART_RETURN_TIMEOUT_MS
): boolean {
	const requestedAtMs = Date.parse(requestedAt);
	if (Number.isNaN(requestedAtMs)) {
		return false;
	}
	return nowMs - requestedAtMs >= timeoutMs;
}

export async function loadRestartRoundTripPhase(
	requestId: string,
	requestedAt: string,
	fetchImpl: typeof fetch = fetch,
	nowMs: number = Date.now()
): Promise<RestartRoundTripPhase> {
	const timedOut = hasRestartTimedOut(requestedAt, nowMs);

	try {
		const response = await fetchImpl('/api/daemon/restart-status', {
			method: 'GET',
			cache: 'no-store'
		});
		if (!response.ok) {
			return timedOut ? 'failed_to_return' : 'restarting';
		}

		const status = (await response.json()) as RestartStatus;
		if ('requestId' in status && status.requestId === requestId) {
			return status.state === 'back_online' ? 'back_online' : 'requested';
		}

		return timedOut ? 'failed_to_return' : 'restarting';
	} catch {
		return timedOut ? 'failed_to_return' : 'restarting';
	}
}
