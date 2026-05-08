import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { NetworkPostureState } from '$lib/types';
import { apiRequest } from '$lib/server/api';

const VALID_STATES: NetworkPostureState[] = [
	'direct_acknowledged',
	'already_secured_externally',
	'vpn_bridge_pending'
];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const writeToken = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) error(503, 'Service unavailable');

	const { state } = (await request.json()) as { state: NetworkPostureState };
	if (!VALID_STATES.includes(state)) error(400, 'Invalid state');

	const res = await apiRequest('/api/auth/acknowledge-network-posture', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${writeToken}`
		},
		body: JSON.stringify({ state })
	});

	if (!res.ok) error(res.status as 400 | 500, 'Failed to acknowledge network posture');
	return json({ ok: true });
};
