import { env } from '$env/dynamic/private';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

// Straight pass-through of the daemon's own NDJSON stream — unlike
// config/plex-tv-sync (which owns its per-show loop at the web layer),
// the movie sync's loop lives entirely in the daemon (adoptMoviesFromPlex's
// in-memory catalog match — see streamMoviePlexSyncProgress in src/api.ts),
// so there's nothing for this route to do beyond forwarding bytes and
// letting a client disconnect cancel the daemon's own stream the same way.
//
// STREAM_TIMEOUT_MS overrides apiRequest's usual DEFAULT_TIMEOUT_MS (60s)
// for this one call — that budget is sized for a normal request/response
// round trip, but apiRequest's AbortSignal.timeout covers the WHOLE fetch,
// including however long this streamed response's body takes to finish
// reading, not just the time to first byte. A real ~7000-movie library (see
// PlexMovieSyncCard's own doc comment) could plausibly exceed 60s; without
// this override the sync would get silently aborted mid-stream, surfacing a
// false "sync was interrupted" to the user even though the daemon's own
// fullSyncInFlight promise keeps running to completion regardless. Found
// in code review before this ever shipped.
const STREAM_TIMEOUT_MS = 20 * 60_000;

export const POST: RequestHandler = async () => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return Response.json(
			{ error: 'Plex movie sync is unavailable without API write access.' },
			{ status: 403 }
		);
	}

	let response: Response;
	try {
		response = await apiRequest(
			'/api/movie-calendar/plex-sync?stream=true',
			{
				method: 'POST',
				headers: { authorization: `Bearer ${writeToken}` }
			},
			STREAM_TIMEOUT_MS
		);
	} catch (error) {
		console.error('[config plex-movie-sync] failed to reach the API:', error);
		return Response.json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	if (!response.ok || !response.body) {
		return Response.json(
			{ error: `Plex movie sync failed to start (${response.status}).` },
			{ status: response.status || 502 }
		);
	}

	return new Response(response.body, { headers: response.headers });
};
