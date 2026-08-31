import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { CALENDAR_PAGE_SIZE } from '$lib/calendarConfig';
import { apiRequest } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export type CalendarTvItem = {
	tmdbId: number;
	name: string;
	firstAirDate: string | null;
	overview: string;
	posterUrl: string | null;
	popularity: number;
	alreadyTracked: boolean;
	language: string | undefined;
	rating: number | undefined;
	genres: string[];
};

// A full year's worth of calendar items (poster URLs + overviews for ~40
// shows) was found to be large enough to break client-side hydration over
// some mobile/VPN network paths. Only the first page loads with the initial
// SSR response; the client fetches more via infinite scroll (see
// routes/tv-calendar/more/+server.ts).
export const _PAGE_SIZE = CALENDAR_PAGE_SIZE;

export const load: PageServerLoad = async () => {
	// No offset param: the daemon auto-anchors to today's date within the
	// current year, so the visitor lands on the relevant part of the
	// calendar instead of always January 1st. See anchorOffsetForToday in
	// src/tmdb/calendar.ts.
	// Stays on the full 60s budget, not the nav-blocking one — this route can
	// legitimately chain TMDB calls (see api.ts's DEFAULT_TIMEOUT_MS comment).
	let response: Response;
	try {
		response = await apiRequest(`/api/calendar/tv?limit=${_PAGE_SIZE}`);
	} catch (error) {
		console.error('[tv-calendar] failed to reach /api/calendar/tv:', error);
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarTvItem[],
			total: 0,
			offset: 0,
			tmdbConfigured: true,
			error: 'Could not reach the API.'
		};
	}

	if (response.status === 409) {
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarTvItem[],
			total: 0,
			offset: 0,
			tmdbConfigured: false,
			error: null
		};
	}

	if (!response.ok) {
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarTvItem[],
			total: 0,
			offset: 0,
			tmdbConfigured: true,
			error: `Calendar request failed (${response.status}).`
		};
	}

	try {
		const body = (await response.json()) as {
			year: number;
			items: CalendarTvItem[];
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
		console.error('[tv-calendar] failed to parse /api/calendar/tv response:', error);
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarTvItem[],
			total: 0,
			offset: 0,
			tmdbConfigured: true,
			error: 'Calendar response was invalid.'
		};
	}
};

export const actions: Actions = {
	addShow: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) return fail(500, { addShowMessage: 'Server write token is not configured.' });

		const formData = await request.formData();
		const name = String(formData.get('name') ?? '').trim();
		if (!name) return fail(400, { addShowMessage: 'Show name is required.' });

		let configResponse: Response;
		try {
			configResponse = await apiRequest('/api/config');
		} catch (error) {
			console.error('[tv-calendar] failed to load current config:', error);
			return fail(503, { addShowMessage: 'Could not reach the API.' });
		}

		if (!configResponse.ok) {
			return fail(configResponse.status, { addShowMessage: 'Could not load current config.' });
		}

		const ifMatch = configResponse.headers.get('etag') ?? '';
		const config = (await configResponse.json()) as { tv?: { name: string }[] };
		const existingNames = (config.tv ?? []).map((rule) => rule.name);

		if (existingNames.some((existing) => existing.trim().toLowerCase() === name.toLowerCase())) {
			return { addShowSuccess: true, addedName: name, message: `${name} is already tracked.` };
		}

		// New shows land at the top of the watchlist, matching the Config
		// page's "Add show" behavior.
		const showNames = [name, ...existingNames];

		try {
			const response = await apiRequest('/api/config', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify({ runtime: {}, tv: { shows: showNames } })
			});

			if (!response.ok) {
				let addShowMessage = `Add show failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) addShowMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, { addShowMessage });
			}

			return { addShowSuccess: true, addedName: name, message: `${name} added to your watchlist.` };
		} catch (error) {
			console.error('[tv-calendar] addShow failed:', error);
			return fail(500, { addShowMessage: 'Could not add show.' });
		}
	}
};
