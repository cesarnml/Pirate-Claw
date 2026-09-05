import { env } from '$env/dynamic/private';
import { deriveOnboardingStatus } from '$lib/onboarding';
import { apiRequest, navApiFetch } from '$lib/server/api';
import type {
	AppConfig,
	CandidateStateRecord,
	DaemonHealth,
	ManualGrabArchiveEntry,
	ManualGrabTrackedEntry,
	OnboardingStatus,
	RunSummaryRecord,
	ReviewOutcomeRecord,
	TorrentStatSnapshot
} from '$lib/types';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// A background refresh (idle poll, post-action invalidateAll()) re-runs this
// load() from scratch. When one of several independent daemon calls times
// out under contention, that must not read as "confirmed empty" and wipe a
// section the user was just looking at — see the dashboard-load-path review,
// roadmap item #1. Each field falls back to the last value we successfully
// loaded (this process is a single long-running instance, so this survives
// across requests) instead of being coerced to null. The very first load has
// nothing to fall back to yet, so it behaves exactly as before.
let lastGoodHealth: DaemonHealth | null = null;
let lastGoodTransmissionTorrents: TorrentStatSnapshot[] | null = null;
let lastGoodCandidates: CandidateStateRecord[] | null = null;
let lastGoodRunSummaries: RunSummaryRecord[] | null = null;
let lastGoodOutcomes: ReviewOutcomeRecord[] | null = null;
let lastGoodOnboarding: OnboardingStatus | null = null;
let lastGoodManualGrabArchive: ManualGrabArchiveEntry[] | null = null;
let lastGoodManualGrabsTracked: ManualGrabTrackedEntry[] | null = null;

export const load: PageServerLoad = async () => {
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;
	const [
		healthResult,
		torrentsResult,
		candidatesResult,
		statusResult,
		outcomesResult,
		configResult,
		manualGrabArchiveResult,
		manualGrabsTrackedResult
	] = await Promise.allSettled([
		navApiFetch<DaemonHealth>('/api/health'),
		navApiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents'),
		navApiFetch<{ candidates: CandidateStateRecord[] }>('/api/candidates'),
		navApiFetch<{ runs: RunSummaryRecord[] }>('/api/status'),
		navApiFetch<{ outcomes: ReviewOutcomeRecord[] }>('/api/outcomes?status=failed_enqueue'),
		navApiFetch<AppConfig>('/api/config'),
		// The manual-grab-sourced half of Your Haul — see ArchiveStrip/+page.svelte.
		navApiFetch<{ items: ManualGrabArchiveEntry[] }>('/api/manual-grabs/completed'),
		// Every manual grab with a hash, independent of Transmission — powers
		// missingManualGrabs (the manual-grab sibling of missingCandidates).
		navApiFetch<{ items: ManualGrabTrackedEntry[] }>('/api/manual-grabs/tracked')
	]);

	if (healthResult.status === 'fulfilled') lastGoodHealth = healthResult.value;
	const health = healthResult.status === 'fulfilled' ? healthResult.value : lastGoodHealth;

	if (torrentsResult.status === 'fulfilled') {
		lastGoodTransmissionTorrents = torrentsResult.value.torrents;
	}
	const transmissionTorrents =
		torrentsResult.status === 'fulfilled'
			? torrentsResult.value.torrents
			: lastGoodTransmissionTorrents;

	if (candidatesResult.status === 'fulfilled')
		lastGoodCandidates = candidatesResult.value.candidates;
	const candidates =
		candidatesResult.status === 'fulfilled'
			? candidatesResult.value.candidates
			: lastGoodCandidates;

	if (statusResult.status === 'fulfilled') lastGoodRunSummaries = statusResult.value.runs;
	const runSummaries =
		statusResult.status === 'fulfilled' ? statusResult.value.runs : lastGoodRunSummaries;

	if (outcomesResult.status === 'fulfilled') lastGoodOutcomes = outcomesResult.value.outcomes;
	const outcomes =
		outcomesResult.status === 'fulfilled' ? outcomesResult.value.outcomes : lastGoodOutcomes;

	if (manualGrabArchiveResult.status === 'fulfilled') {
		lastGoodManualGrabArchive = manualGrabArchiveResult.value.items;
	}
	const manualGrabArchive =
		manualGrabArchiveResult.status === 'fulfilled'
			? manualGrabArchiveResult.value.items
			: lastGoodManualGrabArchive;

	if (manualGrabsTrackedResult.status === 'fulfilled') {
		lastGoodManualGrabsTracked = manualGrabsTrackedResult.value.items;
	}
	const manualGrabsTracked =
		manualGrabsTrackedResult.status === 'fulfilled'
			? manualGrabsTrackedResult.value.items
			: lastGoodManualGrabsTracked;

	if (configResult.status === 'fulfilled') {
		lastGoodOnboarding = deriveOnboardingStatus(configResult.value, canWrite);
	}
	const onboarding: OnboardingStatus | null =
		configResult.status === 'fulfilled'
			? deriveOnboardingStatus(configResult.value, canWrite)
			: lastGoodOnboarding;

	// Only the initial load — nothing to fall back to yet — should be able to
	// blank the whole page; a poll that fails with a good previous value on
	// hand must not re-trigger the page-level error gate.
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
	if (manualGrabArchiveResult.status === 'rejected') {
		console.error(
			'[dashboard] failed to load /api/manual-grabs/completed',
			manualGrabArchiveResult.reason
		);
	}
	if (manualGrabsTrackedResult.status === 'rejected') {
		console.error(
			'[dashboard] failed to load /api/manual-grabs/tracked',
			manualGrabsTrackedResult.reason
		);
	}

	return {
		health,
		transmissionTorrents,
		candidates,
		runSummaries,
		outcomes,
		onboarding,
		manualGrabArchive,
		manualGrabsTracked,
		error
	};
};

function requireWriteToken(): string | ReturnType<typeof fail> {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return fail(500, { error: 'Server write token is not configured.' });
	}
	return writeToken;
}

async function torrentAction(
	path: string,
	request: Request
): Promise<ReturnType<typeof fail> | { ok: boolean }> {
	const tokenOrFail = requireWriteToken();
	if (typeof tokenOrFail !== 'string') return tokenOrFail;

	const formData = await request.formData();
	const hash = formData.get('hash');
	if (typeof hash !== 'string') return fail(400, { error: 'hash is required' });
	const res = await apiRequest(path, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			authorization: `Bearer ${tokenOrFail}`
		},
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
		const tokenOrFail = requireWriteToken();
		if (typeof tokenOrFail !== 'string') return tokenOrFail;

		const formData = await request.formData();
		const hash = formData.get('hash');
		const disposition = formData.get('disposition');

		if (typeof hash !== 'string' || typeof disposition !== 'string') {
			return fail(400, { error: 'hash and disposition are required' });
		}

		const res = await apiRequest('/api/transmission/torrent/dispose', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${tokenOrFail}`
			},
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

	autoReconcile: async () => {
		const tokenOrFail = requireWriteToken();
		if (typeof tokenOrFail !== 'string') return tokenOrFail;

		const res = await apiRequest('/api/transmission/torrents/auto-reconcile', {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenOrFail}` }
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
		const data = (await res.json()) as { resolved: string[]; checked: number };
		return { ok: true, ...data };
	},

	pause: async ({ request }) => torrentAction('/api/transmission/torrent/pause', request),
	resume: async ({ request }) => torrentAction('/api/transmission/torrent/resume', request),
	resumeNow: async ({ request }) => torrentAction('/api/transmission/torrent/resume-now', request),
	remove: async ({ request }) => torrentAction('/api/transmission/torrent/remove', request),
	removeAndDelete: async ({ request }) =>
		torrentAction('/api/transmission/torrent/remove-and-delete', request),

	requeue: async ({ request }) => {
		const tokenOrFail = requireWriteToken();
		if (typeof tokenOrFail !== 'string') return tokenOrFail;

		const formData = await request.formData();
		const identityKey = formData.get('identityKey');
		if (typeof identityKey !== 'string') return fail(400, { error: 'identityKey is required' });
		const res = await apiRequest(`/api/candidates/${encodeURIComponent(identityKey)}/requeue`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenOrFail}` }
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
