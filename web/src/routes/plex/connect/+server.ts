import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		throw redirect(303, '/config?plexAuthError=Config+writes+are+disabled.');
	}

	const response = await apiRequest('/api/plex/auth/start', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${writeToken}`
		},
		body: JSON.stringify({
			forwardUrl: `${url.origin}/plex/connect/callback`,
			returnTo: url.searchParams.get('returnTo') ?? '/config'
		})
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { error?: string };
		throw redirect(
			303,
			`/config?plexAuthError=${encodeURIComponent(body.error ?? 'Could not start Plex auth.')}`
		);
	}

	const body = (await response.json()) as { redirectUrl: string };
	throw redirect(303, body.redirectUrl);
};
