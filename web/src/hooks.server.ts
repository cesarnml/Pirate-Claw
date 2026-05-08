import { readFileSync } from 'fs';
import { redirect, type Handle } from '@sveltejs/kit';
import {
	initSessionSecret,
	getSessionSecret,
	verifyJwt,
	SESSION_COOKIE_NAME
} from '$lib/server/session';
import { apiRequest } from '$lib/server/api';
import { log } from '$lib/server/log';

const PUBLIC_PATHS = new Set(['/setup', '/login', '/logout']);

const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
]);

let trustedOrigins: string[] = [];

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

	trustedOrigins = [];
	const originsFile = process.env.PIRATE_CLAW_TRUSTED_ORIGINS_FILE;
	if (originsFile) {
		try {
			const raw: unknown = JSON.parse(readFileSync(originsFile, 'utf8'));
			if (Array.isArray(raw)) {
				trustedOrigins = (raw as unknown[]).filter((x): x is string => typeof x === 'string');
				log('info', { event: 'csrf_origins_loaded', count: trustedOrigins.length });
			} else {
				log('warn', { event: 'csrf_origins_invalid', file: originsFile });
			}
		} catch (error) {
			log('warn', {
				event: 'csrf_origins_load_failed',
				file: originsFile,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	} else {
		log('debug', { event: 'csrf_origins_not_configured' });
	}
}

function isAllowedOrigin(origin: string | null, serverOrigin: string): boolean {
	if (!origin) return true;
	if (origin === serverOrigin) return true;
	return trustedOrigins.includes(origin);
}

function isMutatingFormRequest(request: Request): boolean {
	const method = request.method.toUpperCase();
	if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
	const ct = (request.headers.get('content-type') ?? '').split(';')[0].trim();
	return FORM_CONTENT_TYPES.has(ct);
}

export const handle: Handle = async ({ event, resolve }) => {
	// Custom CSRF check — built-in SvelteKit CSRF is disabled in svelte.config.js
	if (isMutatingFormRequest(event.request)) {
		const origin = event.request.headers.get('origin');
		const serverOrigin = process.env.ORIGIN ?? event.url.origin;
		if (!isAllowedOrigin(origin, serverOrigin)) {
			log('warn', { event: 'csrf_rejected', origin, serverOrigin });
			return new Response('Cross-site form submissions are not allowed.', { status: 403 });
		}
		log('debug', { event: 'csrf_allowed', origin, serverOrigin });
	}

	const path = event.url.pathname;

	if (PUBLIC_PATHS.has(path)) {
		event.locals.user = null;
		return resolve(event);
	}

	const secret = getSessionSecret();
	if (!secret) {
		event.locals.user = null;
		log('debug', { event: 'session_no_secret', path });
		return resolve(event);
	}

	const token = event.cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		const user = await verifyJwt(token, secret);
		if (user) {
			event.locals.user = user;
			log('debug', { event: 'session_valid', username: user.username, path });
			return resolve(event);
		}
	}
	event.locals.user = null;

	// API routes return 401 rather than redirecting
	if (path.startsWith('/api/')) {
		log('debug', { event: 'api_unauthorized', path });
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}

	const destination = await resolveUnauthenticatedPageRedirect(
		process.env.PIRATE_CLAW_API_WRITE_TOKEN
	);
	log('info', { event: 'auth_redirect', path, destination });
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
