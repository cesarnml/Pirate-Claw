import { readFileSync } from 'fs';
import { redirect, type Handle } from '@sveltejs/kit';
import {
	initSessionSecret,
	getSessionSecret,
	verifyJwt,
	SESSION_COOKIE_NAME
} from '$lib/server/session';
import { apiRequest } from '$lib/server/api';
import { logTimedRequest } from '$lib/server/route-timing';
import { runWithRequestId } from '$lib/server/request-context';

const PUBLIC_PATHS = new Set(['/setup', '/login', '/logout']);

/** Times every route resolution (page loads and +server.ts handlers alike)
 * so an occasional hang leaves a trace instead of only being visible as "the
 * user hit refresh and it was fine the second time." The /api/shows-style
 * TMDB fan-out hangs this is meant to catch resolve in seconds-to-minutes,
 * not milliseconds — see api.ts's per-upstream-call logging (shares this
 * same slow-request bar) for which specific daemon call was the culprit.
 * Wrapped in runWithRequestId so every [api] line this resolve triggers,
 * however deep in a load function, gets the same short id in its own log
 * line — see request-context.ts. */
function timedResolve(
	event: Parameters<Handle>[0]['event'],
	resolve: Parameters<Handle>[0]['resolve']
): Promise<Response> {
	const { pathname } = event.url;
	return runWithRequestId(() =>
		logTimedRequest('[route]', event.request.method, pathname, async () => resolve(event))
	);
}

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

	const secret = getSessionSecret();
	let user: { username: string } | null = null;
	if (secret) {
		const token = event.cookies.get(SESSION_COOKIE_NAME);
		if (token) {
			user = await verifyJwt(token, secret);
		}
	}
	event.locals.user = user;

	// /setup, /login, and /logout stay reachable either way — their own
	// load/actions use `locals.user` to redirect an already-authenticated
	// visitor to `/` (see routes/login and routes/setup +page.server.ts).
	// Forcing locals.user = null here would defeat that guard.
	if (PUBLIC_PATHS.has(path)) {
		return timedResolve(event, resolve);
	}

	if (user) {
		return timedResolve(event, resolve);
	}

	// API routes return 401 rather than redirecting
	if (path.startsWith('/api/')) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}

	const destination = await resolveUnauthenticatedPageRedirect(
		process.env.PIRATE_CLAW_API_WRITE_TOKEN
	);
	redirect(302, destination);
};

export async function resolveUnauthenticatedPageRedirect(
	writeToken: string | undefined
): Promise<'/setup' | '/login'> {
	if (!writeToken) return '/login';

	try {
		const res = await apiRequest('/api/auth/state', {
			headers: { Authorization: `Bearer ${writeToken}` }
		});
		if (res.ok) {
			const state = (await res.json()) as { owner_exists: boolean };
			return state.owner_exists ? '/login' : '/setup';
		}
	} catch {
		// daemon unreachable; fall through to /login
	}

	return '/login';
}
