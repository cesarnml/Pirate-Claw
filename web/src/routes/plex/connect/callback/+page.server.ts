import { env } from '$env/dynamic/private';
import { apiRequest } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	const sessionId = url.searchParams.get('session');

	if (!writeToken || !sessionId) {
		return {
			ok: false,
			message: 'Missing Plex auth session. Start the connect flow again.',
			returnTo: '/config'
		};
	}

	const response = await apiRequest('/api/plex/auth/finalize', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${writeToken}`
		},
		body: JSON.stringify({ sessionId })
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { error?: string };
		return {
			ok: false,
			message: body.error ?? 'Could not complete Plex auth.',
			returnTo: '/config'
		};
	}

	const body = (await response.json()) as { returnTo?: string | null };
	return {
		ok: true,
		message: 'Plex connected successfully.',
		returnTo: body.returnTo ?? '/config'
	};
};
