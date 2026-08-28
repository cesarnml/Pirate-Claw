import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { apiFetch, apiRequest } from '$lib/server/api';
import type { ShowBreakdown, ShowEpisodeStatus, TorrentStatSnapshot } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const title = params.slug;
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;

	const [showsResult, torrentsResult] = await Promise.allSettled([
		apiFetch<{ shows: ShowBreakdown[] }>('/api/shows'),
		apiFetch<{ torrents: TorrentStatSnapshot[] }>('/api/transmission/torrents')
	]);

	if (showsResult.status === 'rejected') {
		console.error('[shows detail] failed to load /api/shows:', showsResult.reason);
		return {
			show: null as ShowBreakdown | null,
			torrents: null,
			episodeStatus: null,
			episodeStatusError: null,
			error: 'Could not reach the API.',
			canWrite
		};
	}

	if (torrentsResult.status === 'rejected') {
		console.error(
			'[shows detail] failed to load /api/transmission/torrents:',
			torrentsResult.reason
		);
	}

	const show =
		showsResult.value.shows.find(
			(entry) => entry.normalizedTitle.toLowerCase() === title.toLowerCase()
		) ?? null;

	let episodeStatus: ShowEpisodeStatus | null = null;
	let episodeStatusError: string | null = null;
	if (show) {
		try {
			const response = await apiFetch<ShowEpisodeStatus>(
				`/api/shows/${encodeURIComponent(title)}/episodes`
			);
			episodeStatus = response;
		} catch (error) {
			// Non-fatal — the rest of the page (TMDB overview, queue history)
			// still renders fine without this panel.
			console.error('[shows detail] failed to load episode status:', error);
			episodeStatusError = 'Could not load the missing-episodes panel.';
		}
	}

	return {
		show,
		torrents: torrentsResult.status === 'fulfilled' ? torrentsResult.value.torrents : null,
		episodeStatus,
		episodeStatusError,
		error: null,
		canWrite
	};
};

export const actions: Actions = {
	refreshTmdb: async ({ params }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { refreshMessage: 'TMDB refresh is unavailable without API write access.' });
		}

		try {
			const response = await apiRequest(
				`/api/shows/${encodeURIComponent(params.slug)}/tmdb/refresh`,
				{
					method: 'POST',
					headers: {
						authorization: `Bearer ${writeToken}`
					}
				}
			);

			if (!response.ok) {
				let refreshMessage = `Refresh failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) refreshMessage = body.error;
				} catch {
					// Keep fallback message.
				}
				return fail(response.status, { refreshMessage });
			}

			return {
				refreshSuccess: true,
				refreshMessage: 'TMDB metadata refreshed.'
			};
		} catch (error) {
			console.error('[shows detail] refreshTmdb failed:', error);
			return fail(500, { refreshMessage: 'Could not refresh TMDB metadata.' });
		}
	},

	manualGrab: async ({ request, params }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { grabMessage: 'Manual grab is unavailable without API write access.' });
		}

		const formData = await request.formData();
		const season = Number(formData.get('season'));
		const episode = Number(formData.get('episode'));
		const magnetUrl = String(formData.get('magnetUrl') ?? '').trim();
		const rawTitle = String(formData.get('rawTitle') ?? '').trim();

		if (!Number.isInteger(season) || !Number.isInteger(episode) || !magnetUrl || !rawTitle) {
			return fail(400, { grabMessage: 'Missing or invalid grab details.' });
		}

		try {
			const response = await apiRequest(
				`/api/shows/${encodeURIComponent(params.slug)}/manual-grab`,
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						authorization: `Bearer ${writeToken}`
					},
					body: JSON.stringify({ season, episode, magnetUrl, rawTitle })
				}
			);

			if (!response.ok) {
				let grabMessage = `Grab failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) grabMessage = body.error;
				} catch {
					// Keep fallback message.
				}
				return fail(response.status, { grabMessage });
			}

			return {
				grabSuccess: true,
				grabMessage: `Queued S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} — ${rawTitle}`
			};
		} catch (error) {
			console.error('[shows detail] manualGrab failed:', error);
			return fail(500, { grabMessage: 'Could not reach the API to queue this episode.' });
		}
	}
};
