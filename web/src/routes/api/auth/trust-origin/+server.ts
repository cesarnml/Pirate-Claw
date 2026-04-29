import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { apiRequest } from '$lib/server/api';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const writeToken = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) error(503, 'Service unavailable');

	const { origin } = (await request.json()) as { origin: string };

	const res = await apiRequest('/api/auth/trust-origin', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${writeToken}`
		},
		body: JSON.stringify({ origin })
	});

	if (!res.ok) error(res.status as 400 | 500, 'Failed to trust origin');
	return json({ ok: true });
};
