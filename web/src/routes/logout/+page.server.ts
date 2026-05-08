import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clearSessionCookie } from '$lib/server/session';

export const load: PageServerLoad = async ({ cookies }) => {
	clearSessionCookie(cookies);
	redirect(302, '/login');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		clearSessionCookie(cookies);
		redirect(302, '/login');
	}
};
