import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import { _PAGE_SIZE } from '../+page.server';
import type { RequestHandler } from './$types';

// Client-side infinite scroll calls this instead of hitting the daemon
// directly — PIRATE_CLAW_API_URL is a server-only env var, so the browser
// has no way to reach the daemon on its own. This just proxies the same
// GET /api/calendar/tv, clamping limit so a tampered request can't ask for
// an oversized page.
export const GET: RequestHandler = async ({ url }) => {
	const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
	const limit = Math.min(
		_PAGE_SIZE,
		Math.max(1, Number(url.searchParams.get('limit')) || _PAGE_SIZE)
	);
	// offset is intentionally forwarded as-is when omitted (not defaulted to
	// 0 here) — "load earlier months" rolling into the previous year omits
	// it on purpose, so the daemon's auto-anchor lands on that year's *last*
	// page instead of its first. See anchorOffsetForToday in
	// src/tmdb/calendar.ts.
	// A missing offset is meaningful (see comment above), so a garbage value
	// (e.g. `offset=abc`) is normalized to the same "omitted" undefined
	// rather than silently collapsing to 0 — malformed input shouldn't
	// quietly behave differently from no input at all.
	const rawOffset = url.searchParams.get('offset');
	const parsedOffset = rawOffset === null ? NaN : Number(rawOffset);
	const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : undefined;

	const params = new URLSearchParams({ year: String(year), limit: String(limit) });
	if (offset !== undefined) params.set('offset', String(offset));

	let response: Response;
	try {
		response = await apiRequest(`/api/calendar/tv?${params}`);
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
		const body = (await response.json()) as {
			year: number;
			items: unknown[];
			total: number;
			offset: number;
		};
		console.log(
			`[calendar] /more requested year=${year} offset=${offset ?? 'auto'} -> resolved year=${body.year} offset=${body.offset} items=${body.items.length}/${body.total}`
		);
		return json({ year: body.year, items: body.items, total: body.total, offset: body.offset });
	} catch (error) {
		console.error('[calendar] /more failed to parse response:', error);
		return json({ error: 'Calendar response was invalid.' }, { status: 502 });
	}
};
