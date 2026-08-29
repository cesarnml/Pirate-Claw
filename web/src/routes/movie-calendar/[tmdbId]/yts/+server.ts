import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

// Mirrors apibay/+server.ts exactly — see its comment. No query params
// needed here: the daemon resolves this movie's IMDb id from TMDB itself.
export const GET: RequestHandler = async ({ params }) => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return json({ error: 'YTS lookup is unavailable without API write access.' }, { status: 403 });
	}

	let response: Response;
	try {
		response = await apiRequest(`/api/movies/${encodeURIComponent(params.tmdbId)}/yts`, {
			headers: { authorization: `Bearer ${writeToken}` }
		});
	} catch (error) {
		console.error('[movie-calendar] yts proxy failed to reach the API:', error);
		return json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	if (!response.ok) {
		let error = `YTS lookup failed (${response.status}).`;
		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) error = body.error;
		} catch {
			// Keep fallback message.
		}
		return json({ error }, { status: response.status });
	}

	try {
		const body = (await response.json()) as { torrents: unknown[] };
		return json({ torrents: body.torrents });
	} catch (error) {
		console.error('[movie-calendar] yts proxy failed to parse response:', error);
		return json({ error: 'The YTS response was invalid.' }, { status: 502 });
	}
};
