import { env } from '$env/dynamic/private';
import { apiRequest } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	const sessionId = url.searchParams.get('session');

	if (!writeToken || !sessionId) {
		return {
			ok: false,
			pending: false,
			message: 'Missing Plex auth session. Start the connect flow again.',
			returnTo: '/config',
			expiresAt: null,
			retryDelayMs: null
		};
	}

	console.log(`[plex-callback] finalize check session=${sessionId}`);

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
			retryAfterMs?: number;
		};
		if (response.status === 409 && body.pending) {
			if (body.retryAfterMs) {
				console.warn(
					`[plex-callback] rate limited session=${sessionId} retryAfterMs=${body.retryAfterMs}`
				);
			}
			return {
				ok: false,
				pending: true,
				message: body.error ?? 'Plex sign-in is still completing.',
				returnTo: body.returnTo ?? '/config',
				expiresAt: body.expiresAt ?? null,
				retryDelayMs: body.retryAfterMs ?? null
			};
		}
		console.error(`[plex-callback] finalize failed session=${sessionId}:`, body.error);
		return {
			ok: false,
			pending: false,
			message: body.error ?? 'Could not complete Plex auth.',
			returnTo: '/config',
			expiresAt: null,
			retryDelayMs: null
		};
	}

	const body = (await response.json()) as { returnTo?: string | null };
	return {
		ok: true,
		pending: false,
		message: 'Plex connected successfully.',
		returnTo: body.returnTo ?? '/config',
		expiresAt: null,
		retryDelayMs: null
	};
};
