import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { MOVIE_CALENDAR_PAGE_SIZE } from '$lib/movieCalendarConfig';
import { apiRequest } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

/** Which ledger recorded the grab, or null when not grabbed / grabbed
 * solely because Plex confirms it with no ledger entry at all. */
export type MovieGrabSource =
	| 'thepiratebay'
	| 'yts'
	| 'adopted-filesystem'
	| 'adopted-plex'
	| 'rss';

export type PlexStatus = 'in_library' | 'missing' | 'unknown';

export type CalendarMovieItem = {
	tmdbId: number;
	title: string;
	releaseDate: string | null;
	overview: string;
	posterUrl: string | null;
	popularity: number;
	alreadyGrabbed: boolean;
	/** See src/movie-api-types.ts's MovieOwnershipStatus doc comment —
	 * grabbed and "confirmed in Plex" are deliberately separate signals,
	 * not flattened into alreadyGrabbed. */
	grabSource: MovieGrabSource | null;
	plexStatus: PlexStatus;
	language: string | undefined;
	rating: number | undefined;
	genres: string[];
	digitalOrPhysicalReleaseDate: string | null;
	estimatedAvailabilityDate: string | null;
};

// Same "large SSR payload breaks hydration" rationale as tv-calendar — see
// its +page.server.ts comment.
export const _PAGE_SIZE = MOVIE_CALENDAR_PAGE_SIZE;

export const load: PageServerLoad = async () => {
	// No offset param: same auto-anchor-to-today behavior as TV calendar —
	// see anchorOffsetForToday in src/tmdb/movie-calendar.ts.
	// Stays on the full 60s budget, not the nav-blocking one — this route can
	// legitimately chain TMDB calls (see api.ts's DEFAULT_TIMEOUT_MS comment).
	let response: Response;
	try {
		response = await apiRequest(`/api/movie-calendar?limit=${_PAGE_SIZE}`);
	} catch (error) {
		console.error('[movie-calendar] failed to reach /api/movie-calendar:', error);
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarMovieItem[],
			total: 0,
			offset: 0,
			tmdbConfigured: true,
			error: 'Could not reach the API.'
		};
	}

	if (response.status === 409) {
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarMovieItem[],
			total: 0,
			offset: 0,
			tmdbConfigured: false,
			error: null
		};
	}

	if (!response.ok) {
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarMovieItem[],
			total: 0,
			offset: 0,
			tmdbConfigured: true,
			error: `Movie calendar request failed (${response.status}).`
		};
	}

	try {
		const body = (await response.json()) as {
			year: number;
			items: CalendarMovieItem[];
			total: number;
			offset: number;
		};
		return {
			year: body.year,
			items: body.items,
			total: body.total,
			offset: body.offset,
			tmdbConfigured: true,
			error: null
		};
	} catch (error) {
		console.error('[movie-calendar] failed to parse /api/movie-calendar response:', error);
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarMovieItem[],
			total: 0,
			offset: 0,
			tmdbConfigured: true,
			error: 'Movie calendar response was invalid.'
		};
	}
};

export const actions: Actions = {
	// Movie-shaped sibling of shows/[slug]'s manualGrab action — no
	// season/episode, tmdbId comes from a hidden form field instead of the
	// route slug, since this page lists many movies at once rather than
	// scoping to a single one. See notes/public/movie-calendar-scope.md for
	// why this bypasses config entirely (no "add to policy" concept for
	// movies) and goes straight to Transmission.
	manualGrab: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { grabMessage: 'Manual grab is unavailable without API write access.' });
		}

		const formData = await request.formData();
		const tmdbId = Number(formData.get('tmdbId'));
		const imdbId = String(formData.get('imdbId') ?? '').trim();
		const magnetUrl = String(formData.get('magnetUrl') ?? '').trim();
		const rawTitle = String(formData.get('rawTitle') ?? '').trim();
		const source = String(formData.get('source') ?? '').trim();

		if (!Number.isInteger(tmdbId) || !magnetUrl || !rawTitle || !source) {
			return fail(400, { grabMessage: 'Missing or invalid grab details.' });
		}

		try {
			const response = await apiRequest(`/api/movies/${tmdbId}/manual-grab`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`
				},
				body: JSON.stringify({
					magnetUrl,
					rawTitle,
					source,
					...(imdbId ? { imdbId } : {})
				})
			});

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

			return { grabSuccess: true, grabTmdbId: tmdbId, grabMessage: `Queued — ${rawTitle}` };
		} catch (error) {
			console.error('[movie-calendar] manualGrab failed:', error);
			return fail(500, { grabMessage: 'Could not reach the API to queue this movie.' });
		}
	}
};
