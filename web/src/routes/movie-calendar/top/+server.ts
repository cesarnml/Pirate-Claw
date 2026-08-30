import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

// Proxies GET /api/movie-calendar/top. A plain view is a free read, but the
// daemon also opportunistically persists cached-Plex-catalog matches on
// every view (applyCachedPlexStatus in src/api.ts) — cheap, no network,
// gated on write auth purely to prove the request came through this
// trusted web app rather than some other container on the `pirate-claw`
// bridge network, so the token is forwarded unconditionally below. A
// rescan=true or sweep=true request additionally hits a third party
// (dvdsreleasedates/TMDB, or a local filesystem walk, respectively) and is
// real mutating work, so those two are hard-rejected without a token
// rather than silently falling back to a read. (Plex is NOT checked by
// sweep=true — that's a separate, deliberate action at
// /api/movie-calendar/plex-sync.)
export const GET: RequestHandler = async ({ url }) => {
	const year = url.searchParams.get('year') ?? String(new Date().getFullYear());
	const rescan = url.searchParams.get('rescan') === 'true';
	const sweep = url.searchParams.get('sweep') === 'true';

	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if ((rescan || sweep) && !writeToken) {
		const action = rescan ? 'Rescan' : 'Checking files';
		return json({ error: `${action} is unavailable without API write access.` }, { status: 403 });
	}
	const headers: Record<string, string> = {};
	if (writeToken) headers.authorization = `Bearer ${writeToken}`;

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
