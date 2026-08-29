import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

// Client-side season switching calls this instead of a full page reload —
// the initial page load (+page.server.ts) already fetches the default
// season server-side; clicking a different season button lazy-fetches just
// that one via this proxy, mirroring calendar/more/+server.ts's pattern.
// Unauthenticated read passthrough — GET /api/shows/:slug/episodes itself
// requires no write token (unlike eztv/thepiratebay/manual-grab).
export const GET: RequestHandler = async ({ params, url }) => {
	const season = url.searchParams.get('season');
	const query = season !== null ? `?season=${encodeURIComponent(season)}` : '';

	let response: Response;
	try {
		response = await apiRequest(`/api/shows/${encodeURIComponent(params.slug)}/episodes${query}`);
	} catch (error) {
		console.error('[shows] /episodes proxy failed to reach the API:', error);
		return json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch (error) {
		console.error('[shows] /episodes proxy failed to parse response:', error);
		return json({ error: 'Episode status response was invalid.' }, { status: 502 });
	}

	return json(body, { status: response.status });
};
