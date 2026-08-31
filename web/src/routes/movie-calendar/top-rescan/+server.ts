import { env } from '$env/dynamic/private';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

// Straight pass-through of the daemon's own NDJSON stream — same shape as
// config/plex-movie-sync: the loop (scraping + per-title TMDB lookups)
// lives entirely in the daemon (getTopMovies's onProgress, see
// src/api.ts's /api/movie-calendar/top-rescan), so there's nothing for
// this route to do beyond forwarding bytes and letting a client disconnect
// cancel the daemon's own stream the same way.
//
// See config/plex-movie-sync's identical STREAM_TIMEOUT_MS for why this is
// needed: apiRequest's default 60s budget covers the WHOLE fetch, not just
// time-to-first-byte, and ~100 sequential TMDB lookups (each independently
// eligible for the client's own rate-limit backoff) can plausibly exceed
// that. Found in code review before this ever shipped.
const STREAM_TIMEOUT_MS = 10 * 60_000;

export const POST: RequestHandler = async ({ url }) => {
	const year = url.searchParams.get('year') ?? String(new Date().getFullYear());

	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return Response.json(
			{ error: 'Rescan is unavailable without API write access.' },
			{ status: 403 }
		);
	}

	let response: Response;
	try {
		response = await apiRequest(
			`/api/movie-calendar/top-rescan?year=${encodeURIComponent(year)}`,
			{
				method: 'POST',
				headers: { authorization: `Bearer ${writeToken}` }
			},
			STREAM_TIMEOUT_MS
		);
	} catch (error) {
		console.error('[movie-calendar] top-rescan proxy failed to reach the API:', error);
		return Response.json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	if (!response.ok || !response.body) {
		return Response.json(
			{ error: `Rescan failed to start (${response.status}).` },
			{ status: response.status || 502 }
		);
	}

	return new Response(response.body, { headers: response.headers });
};
