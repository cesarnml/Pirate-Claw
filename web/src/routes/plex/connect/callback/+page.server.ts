import { env } from '$env/dynamic/private';
import { apiRequest } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	const sessionId = url.searchParams.get('session');
	// URL param is authoritative — it survives Plex's redirect round-trip
	const returnToFromUrl = url.searchParams.get('returnTo') ?? '/config';

	if (!writeToken || !sessionId) {
		return {
			ok: false,
			pending: false,
			message: 'Missing Plex auth session. Start the connect flow again.',
			returnTo: returnToFromUrl,
			expiresAt: null
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
		const body = (await response.json().catch(() => ({}))) as {
			error?: string;
			pending?: boolean;
			returnTo?: string | null;
			expiresAt?: string | null;
		};
		if (response.status === 409 && body.pending) {
			return {
				ok: false,
				pending: true,
				message: body.error ?? 'Plex sign-in is still completing.',
				returnTo: returnToFromUrl,
				expiresAt: body.expiresAt ?? null
			};
		}
		return {
			ok: false,
			pending: false,
			message: body.error ?? 'Could not complete Plex auth.',
			returnTo: returnToFromUrl,
			expiresAt: null
		};
	}

	await response.json();
	console.log({ event: 'plex_callback_redirect', returnTo: returnToFromUrl });
	return {
		ok: true,
		pending: false,
		message: 'Plex connected successfully.',
		returnTo: returnToFromUrl,
		expiresAt: null
	};
};
