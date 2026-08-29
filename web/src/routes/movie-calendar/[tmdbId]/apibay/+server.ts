import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

// Movie-shaped sibling of shows/[slug]/thepiratebay/+server.ts — same
// PIRATE_CLAW_API_URL-is-server-only rationale, same write-auth
// requirement (an outbound call to a third party, not a free read).
export const GET: RequestHandler = async ({ params, url }) => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return json(
			{ error: 'The Pirate Bay lookup is unavailable without API write access.' },
			{ status: 403 }
		);
	}

	const title = url.searchParams.get('title');
	const year = url.searchParams.get('year');
	if (!title) {
		return json({ error: 'title query param is required' }, { status: 400 });
	}

	let response: Response;
	try {
		const query = new URLSearchParams({ title });
		if (year) query.set('year', year);
		response = await apiRequest(
			`/api/movies/${encodeURIComponent(params.tmdbId)}/apibay?${query}`,
			{ headers: { authorization: `Bearer ${writeToken}` } }
		);
	} catch (error) {
		console.error('[movie-calendar] apibay proxy failed to reach the API:', error);
		return json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	if (!response.ok) {
		let error = `The Pirate Bay lookup failed (${response.status}).`;
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
		console.error('[movie-calendar] apibay proxy failed to parse response:', error);
		return json({ error: 'The Pirate Bay response was invalid.' }, { status: 502 });
	}
};
