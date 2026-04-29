import { readFileSync } from 'fs';
import { redirect, type Handle } from '@sveltejs/kit';
import {
	initSessionSecret,
	getSessionSecret,
	verifyJwt,
	SESSION_COOKIE_NAME
} from '$lib/server/session';
import { apiRequest } from '$lib/server/api';

const PUBLIC_PATHS = new Set(['/setup', '/login', '/logout']);

export function init() {
	if (!process.env.PIRATE_CLAW_API_WRITE_TOKEN) {
		const tokenFile = process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
		if (tokenFile) {
			try {
				const token = readFileSync(tokenFile, 'utf8').trim();
				if (token) process.env.PIRATE_CLAW_API_WRITE_TOKEN = token;
			} catch {
				// file not yet written; PIRATE_CLAW_API_WRITE_TOKEN stays unset
			}
		}
	}

	if (!getSessionSecret()) {
		const direct = process.env.PIRATE_CLAW_SESSION_SECRET;
		if (direct) {
			initSessionSecret(direct);
		} else {
			const secretFile = process.env.PIRATE_CLAW_SESSION_SECRET_FILE;
			if (secretFile) {
				try {
					const secret = readFileSync(secretFile, 'utf8').trim();
					if (secret) initSessionSecret(secret);
				} catch {
					// file not yet written; session guard will fall back to passthrough
				}
			}
		}
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (PUBLIC_PATHS.has(path)) {
		event.locals.user = null;
		return resolve(event);
	}

	const secret = getSessionSecret();
	if (!secret) {
		event.locals.user = null;
		return resolve(event);
	}

	const token = event.cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		const user = await verifyJwt(token, secret);
		if (user) {
			event.locals.user = user;
			return resolve(event);
		}
	}

	// API routes return 401 rather than redirecting
	if (path.startsWith('/api/')) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}

	// No valid session — check daemon auth state to decide where to redirect
	const writeToken = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (writeToken) {
		try {
			const res = await apiRequest('/api/auth/state', {
				headers: { Authorization: `Bearer ${writeToken}` }
			});
			if (res.ok) {
				const state = (await res.json()) as { owner_exists: boolean };
				if (!state.owner_exists) {
					redirect(302, '/setup');
				}
			}
		} catch {
			// daemon unreachable; fall through to /login
		}
	}

	redirect(302, '/login');
};
