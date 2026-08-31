import { env } from '$env/dynamic/private';
import { apiFetch, apiRequest } from '$lib/server/api';
import { streamNdjsonProgress } from '$lib/server/ndjson-progress';
import { computeShowCompletion, showDisplayTitle } from '$lib/helpers';
import type { ShowBreakdown } from '$lib/types';
import type { RequestHandler } from './$types';

// Deliberately sequential, one show at a time, with a pause between each —
// this is the bulk version of the shows/[slug] "Refresh Plex" button, and
// that per-show refresh already makes two Plex round trips (whole-show flag,
// then a best-effort per-season completion walk). Firing that back-to-back
// for every missing show with zero gap would be a real storm against a
// self-hosted Plex server; the delay below is a deliberate cushion, not
// incidental. Also reused as-is by Config's Plex TV sync — see
// config/plex-tv-sync/+server.ts.
export const REFRESH_DELAY_MS = 800;

export const POST: RequestHandler = async () => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return Response.json(
			{ error: 'Plex refresh is unavailable without API write access.' },
			{ status: 403 }
		);
	}

	return streamNdjsonProgress<ShowBreakdown, { title: string }>({
		logTag: '[shows refresh-missing]',
		async loadItems() {
			const shows = (await apiFetch<{ shows: ShowBreakdown[] }>('/api/shows')).shows;
			// Same target set the button's own count is built from: shows with
			// confirmed missing episodes, plus shows whose completion has never
			// been checked (status null) — those might turn out missing too.
			return shows.filter((show) => {
				const status = computeShowCompletion(show).status;
				return status === 'missing' || status === null;
			});
		},
		async runItem(show, signal) {
			const response = await apiRequest(
				`/api/shows/${encodeURIComponent(show.normalizedTitle)}/plex/refresh`,
				{
					method: 'POST',
					headers: { authorization: `Bearer ${writeToken}` },
					signal
				}
			);
			return { title: showDisplayTitle(show), ok: response.ok };
		},
		onItemError: (show) => ({ title: showDisplayTitle(show) }),
		delayMs: REFRESH_DELAY_MS
	});
};
