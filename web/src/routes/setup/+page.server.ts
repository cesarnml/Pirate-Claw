import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildApiUrl } from '$lib/server/api';
import { signJwt, issueSessionCookie, getSessionSecret } from '$lib/server/session';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm') ?? '');

		if (!username) return fail(400, { error: 'Username is required' });
		if (!password) return fail(400, { error: 'Password is required' });
		if (password !== confirm) return fail(400, { error: 'Passwords do not match' });

		const writeToken = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			console.error('[setup] no write-token — daemon not ready');
			return fail(503, { error: 'Service unavailable' });
		}

		let res: Response;
		try {
			res = await fetch(buildApiUrl('/api/auth/setup-owner'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${writeToken}`,
					Origin: request.headers.get('origin') ?? ''
				},
				body: JSON.stringify({ username, password })
			});
		} catch (err) {
			console.error('[setup] daemon fetch failed:', String(err));
			return fail(503, { error: 'Daemon unavailable — try again in a moment' });
		}

		console.log('[setup] daemon /api/auth/setup-owner status:', res.status);
		if (res.status === 409) return fail(409, { error: 'Owner already exists' });
		if (!res.ok) return fail(502, { error: 'Setup failed — try again' });

		const secret = getSessionSecret();
		if (!secret) {
			console.error('[setup] session-secret not initialised — cannot issue session');
			return fail(503, { error: 'Session secret not configured' });
		}

		const token = await signJwt(username, secret);
		issueSessionCookie(cookies, token);
		console.log('[setup] owner created, session issued for:', username);
		redirect(302, '/onboarding');
	}
};
