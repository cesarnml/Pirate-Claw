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
		if (!writeToken) return fail(503, { error: 'Service unavailable' });

		const res = await fetch(buildApiUrl('/api/auth/setup-owner'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${writeToken}`,
				Origin: request.headers.get('origin') ?? ''
			},
			body: JSON.stringify({ username, password })
		});

		if (res.status === 409) return fail(409, { error: 'Owner already exists' });
		if (!res.ok) return fail(502, { error: 'Setup failed — try again' });

		const secret = getSessionSecret();
		if (!secret) return fail(503, { error: 'Session secret not configured' });

		const token = await signJwt(username, secret);
		issueSessionCookie(cookies, token);
		redirect(302, '/onboarding');
	}
};
