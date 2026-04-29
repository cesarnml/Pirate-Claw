import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { clearSessionCookie } from '$lib/server/session';

export const actions: Actions = {
	default: async ({ cookies }) => {
		clearSessionCookie(cookies);
		redirect(302, '/login');
	}
};
