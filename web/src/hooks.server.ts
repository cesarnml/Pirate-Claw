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
				if (token) {
					process.env.PIRATE_CLAW_API_WRITE_TOKEN = token;
					console.log('[hooks] init: write-token loaded from file');
				} else {
					console.warn('[hooks] init: write-token file is empty:', tokenFile);
				}
			} catch (err) {
				console.warn('[hooks] init: write-token file unreadable:', tokenFile, String(err));
			}
		} else {
			console.warn('[hooks] init: PIRATE_CLAW_DAEMON_TOKEN_FILE not set; write-token unavailable');
		}
	} else {
		console.log('[hooks] init: write-token already in env');
	}

	if (!getSessionSecret()) {
		const direct = process.env.PIRATE_CLAW_SESSION_SECRET;
		if (direct) {
			initSessionSecret(direct);
			console.log('[hooks] init: session-secret loaded from env var');
		} else {
			const secretFile = process.env.PIRATE_CLAW_SESSION_SECRET_FILE;
			if (secretFile) {
				try {
					const secret = readFileSync(secretFile, 'utf8').trim();
					if (secret) {
						initSessionSecret(secret);
						console.log('[hooks] init: session-secret loaded from file');
					} else {
						console.warn('[hooks] init: session-secret file is empty:', secretFile);
					}
				} catch (err) {
					console.warn('[hooks] init: session-secret file unreadable:', secretFile, String(err));
				}
			} else {
				console.warn(
					'[hooks] init: no session-secret source configured; auth guard will passthrough'
				);
			}
		}
	} else {
		console.log('[hooks] init: session-secret already initialised');
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
		console.warn(
			'[hooks] handle: no session-secret — passing request through unauthenticated:',
			path
		);
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
		console.log('[hooks] handle: session cookie present but invalid/expired — redirecting:', path);
	}
	event.locals.user = null;

	// API routes return 401 rather than redirecting
	if (path.startsWith('/api/')) {
		console.log('[hooks] handle: unauthenticated API request → 401:', path);
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}

	const destination = await resolveUnauthenticatedPageRedirect(
		process.env.PIRATE_CLAW_API_WRITE_TOKEN
	);
	console.log(`[hooks] handle: unauthenticated page request → ${destination}:`, path);
	redirect(302, destination);
};

export async function resolveUnauthenticatedPageRedirect(
	writeToken: string | undefined
): Promise<'/setup' | '/login'> {
	if (!writeToken) {
		console.warn('[hooks] resolveRedirect: no write-token → /login');
		return '/login';
	}

	try {
		const res = await apiRequest('/api/auth/state', {
			headers: { Authorization: `Bearer ${writeToken}` }
		});
		if (res.ok) {
			const state = (await res.json()) as { owner_exists: boolean };
			const dest = state.owner_exists ? '/login' : '/setup';
			console.log(`[hooks] resolveRedirect: owner_exists=${state.owner_exists} → ${dest}`);
			return dest;
		}
		console.warn('[hooks] resolveRedirect: /api/auth/state non-ok status:', res.status, '→ /login');
	} catch (err) {
		console.warn('[hooks] resolveRedirect: daemon unreachable → /login:', String(err));
	}

	return '/login';
}
