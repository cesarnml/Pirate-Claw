import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

// The "find on EZTV" inline expand fetches this client-side instead of
// hitting the daemon directly — PIRATE_CLAW_API_URL is a server-only env
// var, same reason as calendar/more/+server.ts. Requires write auth (this
// triggers an outbound call to EZTV, not a free read) the same way the
// daemon endpoint itself does.
export const GET: RequestHandler = async ({ params, url }) => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return json({ error: 'EZTV lookup is unavailable without API write access.' }, { status: 403 });
	}

	const season = url.searchParams.get('season');
	const episode = url.searchParams.get('episode');
	if (!season || !episode) {
		return json({ error: 'season and episode query params are required' }, { status: 400 });
	}

	let response: Response;
	try {
		response = await apiRequest(
			`/api/shows/${encodeURIComponent(params.slug)}/eztv?season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`,
			{ headers: { authorization: `Bearer ${writeToken}` } }
		);
	} catch (error) {
		console.error('[shows detail] eztv proxy failed to reach the API:', error);
		return json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	if (!response.ok) {
		let error = `EZTV lookup failed (${response.status}).`;
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
		console.error('[shows detail] eztv proxy failed to parse response:', error);
		return json({ error: 'EZTV response was invalid.' }, { status: 502 });
	}
};
