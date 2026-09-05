import { env } from '$env/dynamic/private';
import { deriveOnboardingStatus } from '$lib/onboarding';
import { apiRequest, navApiFetch } from '$lib/server/api';
import { currentRequestId } from '$lib/server/request-context';
import type {
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

export const load: PageServerLoad = async ({ parent }) => {
	const start = Date.now();
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;

	// Fire this page's own 6 calls immediately, then await parent() — do NOT
	// await parent() first. The layout's load() already fetches /api/health
	// and /api/config (see roadmap item #5, dashboard-load-path review), so
	// reading them from parent() instead of re-fetching removes 2 of the 16
	// daemon round trips per navigation for free. But parent() also waits on
	// layout calls this page doesn't need (readiness, install-health,
	// auth/state) — awaiting it before starting this page's own fetches
	// would serialize this page's latency behind the layout's worst-case
	// call instead of overlapping them, turning a "free" dedupe into a
	// regression on the p99 tail. Firing both in parallel and joining at the
	// end keeps the same fully-parallel shape the pre-existing 8-call
	// Promise.allSettled had.
	const resultsPromise = Promise.allSettled([
		navApiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents'),
		navApiFetch<{ candidates: CandidateStateRecord[] }>('/api/candidates'),
		navApiFetch<{ runs: RunSummaryRecord[] }>('/api/status'),
		navApiFetch<{ outcomes: ReviewOutcomeRecord[] }>('/api/outcomes?status=failed_enqueue'),
		// The manual-grab-sourced half of Your Haul — see ArchiveStrip/+page.svelte.
		navApiFetch<{ items: ManualGrabArchiveEntry[] }>('/api/manual-grabs/completed'),
		// Every manual grab with a hash, independent of Transmission — powers
		// missingManualGrabs (the manual-grab sibling of missingCandidates).
		navApiFetch<{ items: ManualGrabTrackedEntry[] }>('/api/manual-grabs/tracked')
	]);

	const parentData = await parent();

	const [
		torrentsResult,
		candidatesResult,
		statusResult,
		outcomesResult,
		manualGrabArchiveResult,
		manualGrabsTrackedResult
	] = await resultsPromise;

	if (parentData.health) lastGoodHealth = parentData.health;
	const health = parentData.health ?? lastGoodHealth;
	const healthFresh = parentData.health !== null;

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

	// config comes from the layout's parent() data now (see roadmap item #5)
	// rather than its own fetch — null here means the layout's own
	// /api/config call failed, same meaning the old configResult.status ===
	// 'rejected' check had.
	const config = parentData.config;
	// deriveOnboardingStatus is pure, so compute it once and reuse it for
	// both the cache write and this load's own value — no need to call it
	// twice with identical arguments.
	if (config) {
		lastGoodOnboarding = deriveOnboardingStatus(config, canWrite);
	}
	const onboarding: OnboardingStatus | null = lastGoodOnboarding;

	// The page-level error gate hides every section ({#if data.error} in
	// +page.svelte), so it must only fire when there is genuinely nothing to
	// render. /api/health is the cheapest of this navigation's daemon calls
	// and, under daemon contention, one of the more likely to time out on its
	// own — a
	// lone health miss is closer to queue contention than an outage, and
	// blanking sections that loaded fine in the same request was the
	// highest-visibility flicker in the dashboard-load-path review (roadmap
	// item #2). Only blank the page when health has no value *and* every
	// section the page actually renders also has nothing to show (no fresh
	// value, no last-good fallback) — i.e. this really is the first load and
	// the daemon is unreachable, not one call among several that happened to
	// miss. `onboarding` is deliberately excluded: it's derived from
	// /api/config, the cheapest in-memory read of the set (§14 of the
	// review) and near-certain to succeed even during a real outage — if it
	// counted here, one lucky config fetch could suppress the error banner
	// while every actual dashboard section (torrents, candidates, outcomes,
	// …) has nothing to render.
	const contentFields = [
		transmissionTorrents,
		candidates,
		runSummaries,
		outcomes,
		manualGrabArchive,
		manualGrabsTracked
	];
	const error =
		health === null && contentFields.every((field) => field === null)
			? 'Could not reach the API.'
			: null;

	// Only log at error level when there's truly nothing to show (no fresh
	// value, no last-good fallback) — a lone health miss covered by the
	// last-good cache isn't an outage (roadmap item #2's whole point), so it
	// shouldn't reintroduce the alert noise that item was meant to remove.
	// The structured load_outcome line below already records every
	// last-good-fallback case via fields_served_from_last_good.
	if (health === null) {
		console.error('[dashboard] health unavailable — no fresh value and no last-good fallback');
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
	// Same "only alarm when there's nothing to fall back to" rule as health
	// above — onboarding isn't part of the error-gate quorum anyway (see the
	// comment above `contentFields`), so a config miss covered by
	// lastGoodOnboarding is even less noteworthy than a health miss.
	if (!config && lastGoodOnboarding === null) {
		console.error(
			'[dashboard] config unavailable — no fresh value and no last-good onboarding fallback'
		);
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

	// One structured per-load outcome line (roadmap item #15). §01/§11 of the
	// dashboard-load-path review had to hand-correlate scattered [dashboard]
	// failure lines across two containers' logs to answer "did this load
	// actually succeed, and how well" — this answers it in one grep.
	// fields_served_from_last_good is the number to watch first: it's the
	// only thing that retroactively measures how often the last-good cache
	// (roadmap item #1) actually fires, which is the phenomenon §01's
	// flagged-but-unverified "~51% of loads" figure was trying to describe.
	const fieldFreshness: Record<string, boolean> = {
		health: healthFresh,
		transmissionTorrents: torrentsResult.status === 'fulfilled',
		candidates: candidatesResult.status === 'fulfilled',
		runSummaries: statusResult.status === 'fulfilled',
		outcomes: outcomesResult.status === 'fulfilled',
		onboarding: config !== null,
		manualGrabArchive: manualGrabArchiveResult.status === 'fulfilled',
		manualGrabsTracked: manualGrabsTrackedResult.status === 'fulfilled'
	};
	const fieldValues: Record<string, unknown> = {
		health,
		transmissionTorrents,
		candidates,
		runSummaries,
		outcomes,
		onboarding,
		manualGrabArchive,
		manualGrabsTracked
	};
	let nFailed = 0;
	let fieldsServedFromLastGood = 0;
	for (const key of Object.keys(fieldFreshness)) {
		if (fieldFreshness[key]) continue;
		if (fieldValues[key] !== null) {
			fieldsServedFromLastGood++;
		} else {
			nFailed++;
		}
	}
	console.log(
		`[dashboard] load_outcome id=${currentRequestId() ?? 'n/a'} n_calls=${
			Object.keys(fieldFreshness).length
		} n_failed=${nFailed} fields_served_from_last_good=${fieldsServedFromLastGood} total_ms=${
			Date.now() - start
		} health_stress=${health?.stress ?? 'unknown'}`
	);

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
