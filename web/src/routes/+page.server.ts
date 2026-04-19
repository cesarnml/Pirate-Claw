import { env } from '$env/dynamic/private';
import { deriveOnboardingStatus } from '$lib/onboarding';
import { apiFetch, apiRequest } from '$lib/server/api';
import type {
	AppConfig,
	CandidateStateRecord,
	DaemonHealth,
	OnboardingStatus,
	RunSummaryRecord,
	SessionInfo,
	SkippedOutcomeRecord,
	TorrentStatSnapshot
} from '$lib/types';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;
	const [
		healthResult,
		sessionResult,
		torrentsResult,
		candidatesResult,
		statusResult,
		outcomesResult,
		configResult
	] = await Promise.allSettled([
		apiFetch<DaemonHealth>('/api/health'),
		apiFetch<SessionInfo>('/api/transmission/session'),
		apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents'),
		apiFetch<{ candidates: CandidateStateRecord[] }>('/api/candidates'),
		apiFetch<{ runs: RunSummaryRecord[] }>('/api/status'),
		apiFetch<{ outcomes: SkippedOutcomeRecord[] }>('/api/outcomes?status=skipped_no_match'),
		apiFetch<AppConfig>('/api/config')
	]);

	const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
	const transmissionSession = sessionResult.status === 'fulfilled' ? sessionResult.value : null;
	const transmissionTorrents =
		torrentsResult.status === 'fulfilled' ? torrentsResult.value.torrents : null;
	const candidates =
		candidatesResult.status === 'fulfilled' ? candidatesResult.value.candidates : null;
	const runSummaries = statusResult.status === 'fulfilled' ? statusResult.value.runs : null;
	const outcomes = outcomesResult.status === 'fulfilled' ? outcomesResult.value.outcomes : null;
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
	if (statusResult.status === 'rejected') {
		console.error('[dashboard] failed to load /api/status', statusResult.reason);
	}
	if (outcomesResult.status === 'rejected') {
		console.error('[dashboard] failed to load /api/outcomes', outcomesResult.reason);
	}
	if (configResult.status === 'rejected') {
		console.error('[dashboard] failed to load /api/config', configResult.reason);
	}

	return {
		health,
		transmissionSession,
		transmissionTorrents,
		candidates,
		runSummaries,
		outcomes,
		onboarding,
		error
	};
};

async function torrentAction(
	path: string,
	request: Request
): Promise<ReturnType<typeof fail> | { ok: boolean }> {
	const formData = await request.formData();
	const hash = formData.get('hash');
	if (typeof hash !== 'string') return fail(400, { error: 'hash is required' });
	const res = await apiRequest(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ hash })
	});
	if (!res.ok) {
		let error = 'Request failed';
		try {
			const body = (await res.json()) as { error?: string };
			if (body.error) error = body.error;
		} catch {
			// ignore parse error
		}
		return fail(res.status, { error });
	}
	return { ok: true };
}

export const actions: Actions = {
	dispose: async ({ request }) => {
		const formData = await request.formData();
		const hash = formData.get('hash');
		const disposition = formData.get('disposition');

		if (typeof hash !== 'string' || typeof disposition !== 'string') {
			return fail(400, { error: 'hash and disposition are required' });
		}

		const res = await apiRequest('/api/transmission/torrent/dispose', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hash, disposition })
		});

		if (!res.ok) {
			let error = 'Request failed';
			try {
				const body = (await res.json()) as { error?: string };
				if (body.error) error = body.error;
			} catch {
				// ignore parse error
			}
			return fail(res.status, { error });
		}

		return { ok: true };
	},

	pause: async ({ request }) => torrentAction('/api/transmission/torrent/pause', request),
	resume: async ({ request }) => torrentAction('/api/transmission/torrent/resume', request),
	remove: async ({ request }) => torrentAction('/api/transmission/torrent/remove', request),
	removeAndDelete: async ({ request }) =>
		torrentAction('/api/transmission/torrent/remove-and-delete', request),

	requeue: async ({ request }) => {
		const formData = await request.formData();
		const identityKey = formData.get('identityKey');
		if (typeof identityKey !== 'string') return fail(400, { error: 'identityKey is required' });
		const res = await apiRequest(`/api/candidates/${encodeURIComponent(identityKey)}/requeue`, {
			method: 'POST'
		});
		if (!res.ok) {
			let error = 'Request failed';
			try {
				const body = (await res.json()) as { error?: string };
				if (body.error) error = body.error;
			} catch {
				// ignore parse error
			}
			return fail(res.status, { error });
		}
		return { ok: true };
	}
};
