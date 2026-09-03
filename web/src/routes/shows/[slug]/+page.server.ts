import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { apiFetch, apiRequest, navApiFetch } from '$lib/server/api';
import type { ShowBreakdown, ShowEpisodeStatus, ShowSeasonCompletion } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

/**
 * Overrides `show.seasonCompletions` for whichever season(s) `episodeStatus`
 * just live-walked with fresh aired/owned counts, instead of leaving the
 * page's top "Plex Status" card reading whatever `/api/shows` happened to
 * have cached at the moment it was called (a snapshot from *before* this
 * same request's own `/episodes` call ran and persisted an updated row for
 * that season server-side — see persistSeasonCompletions in src/api.ts).
 * Investigated live 2026-09-02: the per-episode grid below the top card can
 * show every episode as in_library while the card above still says
 * "MISSING (1)", both from the very same page load, purely because the two
 * numbers came from two sequential API calls straddling the moment the
 * daemon updated its own cache.
 *
 * Same eligibility guard as persistSeasonCompletions: skip a season with any
 * 'unknown' episode (an unconfirmed Plex read, not a real owned/missing
 * verdict) rather than overwrite a real cached count with a false one.
 */
function mergeFreshSeasonCompletions(
	show: ShowBreakdown,
	episodeStatus: ShowEpisodeStatus | null
): ShowBreakdown {
	if (!episodeStatus || !episodeStatus.plexReachable) return show;

	const cachedAt = new Date().toISOString();
	const fresh: ShowSeasonCompletion[] = [];
	for (const season of episodeStatus.seasons) {
		// Mirrors persistSeasonCompletions on the daemon side: a season the
		// server answered *from* the completion cache carries no newer
		// information than the counts already on `show`, so overwriting them
		// (with a fresh cachedAt) would only make stale data look fresh.
		if (season.plexSource === 'cached-completion') continue;

		const hasUnknownEpisode = season.episodes.some((e) => e.plexStatus === 'unknown');
		if (hasUnknownEpisode) continue;

		const ownedCount = season.episodes.filter((e) => e.plexStatus === 'in_library').length;
		fresh.push({
			season: season.season,
			airedCount: season.airedEpisodeCount,
			ownedCount,
			cachedAt
		});
	}
	if (fresh.length === 0) return show;

	const merged = [...(show.seasonCompletions ?? [])];
	for (const completion of fresh) {
		const idx = merged.findIndex((c) => c.season === completion.season);
		if (idx === -1) merged.push(completion);
		else merged[idx] = completion;
	}
	return { ...show, seasonCompletions: merged };
}

export const load: PageServerLoad = async ({ params }) => {
	const title = params.slug;
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;

	let shows: ShowBreakdown[];
	try {
		// Stays on the full 60s budget, not the nav-blocking one — /api/shows
		// can legitimately chain TMDB calls (see api.ts's DEFAULT_TIMEOUT_MS
		// comment). The episode-status fetch below is Plex-backed, not
		// TMDB-chained, so it keeps the fail-fast+retry treatment.
		shows = (await apiFetch<{ shows: ShowBreakdown[] }>('/api/shows')).shows;
	} catch (error) {
		console.error('[shows detail] failed to load /api/shows:', error);
		return {
			show: null as ShowBreakdown | null,
			episodeStatus: null,
			episodeStatusError: null,
			error: 'Could not reach the API.',
			canWrite
		};
	}

	let show =
		shows.find((entry) => entry.normalizedTitle.toLowerCase() === title.toLowerCase()) ?? null;

	let episodeStatus: ShowEpisodeStatus | null = null;
	let episodeStatusError: string | null = null;
	if (show) {
		try {
			// Season omitted here — the daemon defaults to the most recent
			// season on its own (same value MissingEpisodesPanel would compute
			// as its initial selection), so this stays the single source of
			// truth for "which season opens by default" instead of duplicating
			// that choice on both sides.
			const response = await navApiFetch<ShowEpisodeStatus>(
				`/api/shows/${encodeURIComponent(title)}/episodes`
			);
			episodeStatus = response;
			// See mergeFreshSeasonCompletions's doc comment — keeps the top
			// card in step with the per-episode grid this same page load just
			// fetched, instead of trailing it by one request.
			show = mergeFreshSeasonCompletions(show, episodeStatus);
		} catch (error) {
			// Non-fatal — the rest of the page (TMDB overview, missing-episodes
			// panel above) still renders fine without this.
			console.error('[shows detail] failed to load episode status:', error);
			episodeStatusError = 'Could not load the missing-episodes panel.';
		}
	}

	return {
		show,
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

	refreshPlex: async ({ params }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, {
				plexRefreshMessage: 'Plex refresh is unavailable without API write access.'
			});
		}

		try {
			const response = await apiRequest(
				`/api/shows/${encodeURIComponent(params.slug)}/plex/refresh`,
				{
					method: 'POST',
					headers: {
						authorization: `Bearer ${writeToken}`
					}
				}
			);

			if (!response.ok) {
				let plexRefreshMessage = `Refresh failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) plexRefreshMessage = body.error;
				} catch {
					// Keep fallback message.
				}
				return fail(response.status, { plexRefreshMessage });
			}

			return {
				plexRefreshSuccess: true,
				plexRefreshMessage: 'Plex status refreshed.'
			};
		} catch (error) {
			console.error('[shows detail] refreshPlex failed:', error);
			return fail(500, { plexRefreshMessage: 'Could not refresh Plex status.' });
		}
	},

	removeShow: async ({ params }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { removeMessage: 'Untracking is unavailable without API write access.' });
		}

		try {
			const response = await apiRequest(`/api/shows/${encodeURIComponent(params.slug)}`, {
				method: 'DELETE',
				headers: {
					authorization: `Bearer ${writeToken}`
				}
			});

			if (!response.ok) {
				let removeMessage = `Untrack failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) removeMessage = body.error;
				} catch {
					// Keep fallback message.
				}
				return fail(response.status, { removeMessage });
			}

			return { removeSuccess: true };
		} catch (error) {
			console.error('[shows detail] removeShow failed:', error);
			return fail(500, { removeMessage: 'Could not reach the API to untrack this show.' });
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
		// Omitted defaults to 'eztv' server-side (see the daemon's manual-grab
		// handler) — kept optional here too so this action stays backward
		// compatible if a future form doesn't set it.
		const source = String(formData.get('source') ?? '').trim();
		// Best-effort quality/swarm-health snapshot at grab time — logged for
		// a future auto-grab heuristic, never required (see
		// src/manual-grabs/store.ts's doc comment).
		const resolution = String(formData.get('resolution') ?? '').trim();
		const codec = String(formData.get('codec') ?? '').trim();
		const sizeBytesRaw = formData.get('sizeBytes');
		const seedsRaw = formData.get('seeds');
		const peersRaw = formData.get('peers');
		const sizeBytes = sizeBytesRaw !== null ? Number(sizeBytesRaw) : NaN;
		const seeds = seedsRaw !== null ? Number(seedsRaw) : NaN;
		const peers = peersRaw !== null ? Number(peersRaw) : NaN;

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
					body: JSON.stringify({
						season,
						episode,
						magnetUrl,
						rawTitle,
						...(source ? { source } : {}),
						...(resolution ? { resolution } : {}),
						...(codec ? { codec } : {}),
						...(Number.isFinite(sizeBytes) ? { sizeBytes } : {}),
						...(Number.isFinite(seeds) ? { seeds } : {}),
						...(Number.isFinite(peers) ? { peers } : {})
					})
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
	},

	// Reuses the daemon's existing Torrent Manager remove-and-delete route
	// (resolveManagedTorrentAction in api.ts already knows how to manage a
	// manual_grabs-only torrent, not just a candidate_state one) rather than
	// a new endpoint — see MissingEpisodesPanel.svelte's doc comment on the
	// stalled-torrent remove button for why this exists.
	removeStalledGrab: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { removeMessage: 'Removing is unavailable without API write access.' });
		}

		const formData = await request.formData();
		const hash = String(formData.get('hash') ?? '').trim();
		if (!hash) {
			return fail(400, { removeMessage: 'Missing torrent hash.' });
		}

		try {
			const response = await apiRequest('/api/transmission/torrent/remove-and-delete', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`
				},
				body: JSON.stringify({ hash })
			});

			if (!response.ok) {
				let removeMessage = `Remove failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) removeMessage = body.error;
				} catch {
					// Keep fallback message.
				}
				return fail(response.status, { removeMessage });
			}

			return { removeGrabSuccess: true };
		} catch (error) {
			console.error('[shows detail] removeStalledGrab failed:', error);
			return fail(500, { removeMessage: 'Could not reach the API to remove this torrent.' });
		}
	}
};
