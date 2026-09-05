import { readFileSync } from 'fs';
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import {
	initSessionSecret,
	getSessionSecret,
	verifyJwt,
	SESSION_COOKIE_NAME
} from '$lib/server/session';
import { apiRequest } from '$lib/server/api';
import { logTimedRequest } from '$lib/server/route-timing';
import { currentRequestId, runWithRequestId } from '$lib/server/request-context';

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

// The one thing this app had no answer for (dashboard-load-path review §05):
// a throw that escapes a route's own Promise.allSettled boundaries — every
// page/layout load() in this app wraps its daemon calls in allSettled, but
// nothing caught a throw from outside those blocks, so it fell all the way
// through to SvelteKit's bare, unstyled default error page (no project
// +error.svelte existed either). This hook is the log line that would
// otherwise have been missing entirely — the request id ties it to whatever
// [route]/[api] lines led up to it — and the returned object is deliberately
// generic: `error` here can be anything a load()/render call throws,
// including something with a message not meant for a browser to see; the
// real detail lives in this log line, not on the page. See +error.svelte for
// the page it renders into.
export const handleError: HandleServerError = ({ error, event, status }) => {
	const reqId = currentRequestId();
	const message = error instanceof Error ? error.message : String(error);
	console.error(
		`[error]${reqId ? `:${reqId}` : ''} unhandled ${status} on ${event.url.pathname}: ${message}`,
		error instanceof Error ? error.stack : ''
	);
	return {
		message: 'The dashboard hit an unexpected error loading this page.'
	};
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
