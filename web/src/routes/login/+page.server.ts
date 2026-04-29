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

		if (!username || !password) return fail(400, { error: 'Username and password are required' });

		const writeToken = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) return fail(503, { error: 'Service unavailable' });

		const res = await fetch(buildApiUrl('/api/auth/verify-login'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${writeToken}`
			},
			body: JSON.stringify({ username, password })
		});

		if (!res.ok) return fail(502, { error: 'Login service unavailable — try again' });
		const body = (await res.json()) as { ok: boolean };
		if (!body.ok) return fail(401, { error: 'Invalid username or password' });

		const secret = getSessionSecret();
		if (!secret) return fail(503, { error: 'Session secret not configured' });

		const token = await signJwt(username, secret);
		issueSessionCookie(cookies, token);
		redirect(302, '/');
	}
};
