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
	if (!locals.user) {
		console.warn('[network-posture] unauthenticated request rejected');
		error(401, 'Unauthorized');
	}

	const writeToken = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		console.error('[network-posture] no write-token');
		error(503, 'Service unavailable');
	}

	const { state } = (await request.json()) as { state: NetworkPostureState };
	if (!VALID_STATES.includes(state)) {
		console.warn('[network-posture] invalid state received:', state);
		error(400, 'Invalid state');
	}

	console.log('[network-posture] acknowledging state:', state, 'for user:', locals.user.username);

	const res = await apiRequest('/api/auth/acknowledge-network-posture', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${writeToken}`
		},
		body: JSON.stringify({ state })
	});

	console.log('[network-posture] daemon status:', res.status);
	if (!res.ok) error(res.status as 400 | 500, 'Failed to acknowledge network posture');
	return json({ ok: true });
};
