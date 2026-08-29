import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

// Proxies GET /api/movie-calendar/top — a free read normally, but a
// rescan=true or sweep=true request hits a third party (dvdsreleasedates/
// TMDB, or a local filesystem walk, respectively) and writes to
// manual_movie_grabs, so both require write auth just like the daemon
// route itself does for those cases. (Plex is NOT checked by sweep=true —
// that's a separate, deliberate action at /api/movie-calendar/plex-sync.)
export const GET: RequestHandler = async ({ url }) => {
	const year = url.searchParams.get('year') ?? String(new Date().getFullYear());
	const rescan = url.searchParams.get('rescan') === 'true';
	const sweep = url.searchParams.get('sweep') === 'true';

	const headers: Record<string, string> = {};
	if (rescan || sweep) {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			const action = rescan ? 'Rescan' : 'Checking files';
			return json({ error: `${action} is unavailable without API write access.` }, { status: 403 });
		}
		headers.authorization = `Bearer ${writeToken}`;
	}

	let response: Response;
	try {
		const params = new URLSearchParams({ year });
		if (rescan) params.set('rescan', 'true');
		if (sweep) params.set('sweep', 'true');
		response = await apiRequest(`/api/movie-calendar/top?${params}`, { headers });
	} catch (error) {
		console.error('[movie-calendar] top proxy failed to reach the API:', error);
		return json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	if (!response.ok) {
		let error = `Top movies request failed (${response.status}).`;
		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) error = body.error;
		} catch {
			// Keep fallback message.
		}
		return json({ error }, { status: response.status });
	}

	try {
		return json(await response.json());
	} catch (error) {
		console.error('[movie-calendar] top proxy failed to parse response:', error);
		return json({ error: 'Top movies response was invalid.' }, { status: 502 });
	}
};
