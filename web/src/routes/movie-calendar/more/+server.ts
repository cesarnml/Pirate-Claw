import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import { _PAGE_SIZE } from '../+page.server';
import type { RequestHandler } from './$types';

// Mirrors tv-calendar/more/+server.ts exactly — see its comments for why
// this proxy exists and why `offset` is forwarded as-is when omitted.
export const GET: RequestHandler = async ({ url }) => {
	const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
	const limit = Math.min(
		_PAGE_SIZE,
		Math.max(1, Number(url.searchParams.get('limit')) || _PAGE_SIZE)
	);
	const rawOffset = url.searchParams.get('offset');
	const parsedOffset = rawOffset === null ? NaN : Number(rawOffset);
	const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : undefined;

	const params = new URLSearchParams({ year: String(year), limit: String(limit) });
	if (offset !== undefined) params.set('offset', String(offset));

	let response: Response;
	try {
		response = await apiRequest(`/api/movie-calendar?${params}`);
	} catch (error) {
		console.error('[movie-calendar] /more failed to reach /api/movie-calendar:', error);
		return json({ error: 'Could not reach the API.' }, { status: 503 });
	}

	if (!response.ok) {
		return json(
			{ error: `Movie calendar request failed (${response.status}).` },
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
			`[movie-calendar] /more requested year=${year} offset=${offset ?? 'auto'} -> resolved year=${body.year} offset=${body.offset} items=${body.items.length}/${body.total}`
		);
		return json({ year: body.year, items: body.items, total: body.total, offset: body.offset });
	} catch (error) {
		console.error('[movie-calendar] /more failed to parse response:', error);
		return json({ error: 'Movie calendar response was invalid.' }, { status: 502 });
	}
};
