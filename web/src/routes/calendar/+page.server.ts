import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
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
};

export const load: PageServerLoad = async () => {
	let response: Response;
	try {
		response = await apiRequest('/api/calendar/tv');
	} catch (error) {
		console.error('[calendar] failed to reach /api/calendar/tv:', error);
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarTvItem[],
			tmdbConfigured: true,
			error: 'Could not reach the API.'
		};
	}

	if (response.status === 409) {
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarTvItem[],
			tmdbConfigured: false,
			error: null
		};
	}

	if (!response.ok) {
		return {
			year: new Date().getFullYear(),
			items: [] as CalendarTvItem[],
			tmdbConfigured: true,
			error: `Calendar request failed (${response.status}).`
		};
	}

	const body = (await response.json()) as { year: number; items: CalendarTvItem[] };
	return { year: body.year, items: body.items, tmdbConfigured: true, error: null };
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
			console.error('[calendar] failed to load current config:', error);
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
			console.error('[calendar] addShow failed:', error);
			return fail(500, { addShowMessage: 'Could not add show.' });
		}
	}
};
