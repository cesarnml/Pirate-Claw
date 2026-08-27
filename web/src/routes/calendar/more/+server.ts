import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import { _PAGE_SIZE } from '../+page.server';
import type { RequestHandler } from './$types';

// Client-side infinite scroll calls this instead of hitting the daemon
// directly — PIRATE_CLAW_API_URL is a server-only env var, so the browser
// has no way to reach the daemon on its own. This just proxies the same
// GET /api/calendar/tv with the caller's offset, clamping limit so a
// tampered request can't ask for an oversized page.
export const GET: RequestHandler = async ({ url }) => {
	const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0);
	const limit = Math.min(
		_PAGE_SIZE,
		Math.max(1, Number(url.searchParams.get('limit')) || _PAGE_SIZE)
	);

	let response: Response;
	try {
		response = await apiRequest(`/api/calendar/tv?offset=${offset}&limit=${limit}`);
	} catch (error) {
		console.error('[calendar] /more failed to reach /api/calendar/tv:', error);
		return json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	if (!response.ok) {
		return json(
			{ error: `Calendar request failed (${response.status}).` },
			{ status: response.status }
		);
	}

	try {
		const body = (await response.json()) as { items: unknown; total: number };
		return json({ items: body.items, total: body.total });
	} catch (error) {
		console.error('[calendar] /more failed to parse response:', error);
		return json({ error: 'Calendar response was invalid.' }, { status: 502 });
	}
};
