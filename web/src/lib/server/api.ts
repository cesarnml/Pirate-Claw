import { env } from '$env/dynamic/private';
import { logTimedRequest } from './route-timing';
import { beginApiCall, endApiCall, currentRequestId } from './request-context';

// Bounds a single daemon round trip. Generous on purpose: a route like
// /api/shows can legitimately chain a couple of sequential TMDB calls
// server-side, each independently eligible for its own ~15s of 429 backoff
// (see src/tmdb/client.ts) — a tight cap here would turn a slow-but-healthy
// response into a false-positive timeout. The goal isn't to bound normal
// worst-case latency tightly, it's to guarantee a genuine multi-minute hang
// (a burst of concurrent TMDB rate-limit retries piling up behind one
// request) fails fast and visibly instead of spinning the page forever.
// Override via PIRATE_CLAW_API_TIMEOUT_MS if this needs tuning once real
// occurrences show up in the logs below.
//
// This is still the right budget for background/non-nav-blocking work
// (form actions, the shows/refresh-missing bulk loop) — see NAV_TIMEOUT_MS
// below for why page-navigation calls no longer share it.
const DEFAULT_TIMEOUT_MS = 60_000;

// 2026-08-31 page-transition-timeout investigation: this WAS the only
// budget, applied uniformly to every apiRequest call including the ones a
// page `load` awaits before SvelteKit can show the nav as resolved (the
// hamburger/sidebar spinner). It genuinely fired at ~60s when it should —
// the mechanism wasn't broken — but the user-facing symptom ("page seems
// hung, only a hard reload fixes it") turned out not to need more time to
// resolve: a plain reload seconds after a 47-60s [route] line routinely
// finished in 1-5s (see [route] GET /shows/true%20detective lines around
// 2026-08-31T07:48-07:49 in the web container's logs). That means the long
// waits were queueing behind concurrent background load (a bulk Plex
// refresh loop, the daemon's own reconcile cycle) rather than reflecting
// real per-request cost — so raising the nav timeout would only make the
// user stare at the spinner longer for the same outcome a fast retry
// already gets for free. Nav-blocking calls get a short budget plus one
// retry instead; see navApiRequest/navApiFetch.
//
// Deliberately NOT used for the TMDB-chaining routes DEFAULT_TIMEOUT_MS's
// comment above describes (/api/shows, /api/movies, /api/movie-calendar,
// /api/calendar/tv) — those keep the full 60s budget even when the call
// site is a page `load`, because a cold-cache load there can legitimately
// need most of it for TMDB 429 backoff, and this shorter budget would turn
// that healthy-but-slow response into a false-positive failure. It's used
// for daemon/Plex/Transmission-backed reads (health, config, torrents,
// candidates, setup state, the per-show episode/Plex-status walk) — the
// ones actually implicated in the incident above, none of which have a
// documented reason to need more than a few seconds when healthy.
const NAV_TIMEOUT_MS = 12_000;
const NAV_MAX_ATTEMPTS = 2;
// Small delay before a nav retry, so a page load's several concurrent nav
// calls that all miss their budget together (the exact contention scenario
// this exists to route around) don't all re-fire in the same instant and
// re-create the pile-up their first attempt just hit — jittered so N
// concurrent retries spread out instead of landing as one synchronized
// second wave.
const NAV_RETRY_BASE_DELAY_MS = 400;
const NAV_RETRY_JITTER_MS = 400;

function timeoutMs(): number {
	const raw = env.PIRATE_CLAW_API_TIMEOUT_MS;
	const parsed = raw ? Number(raw) : NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function navTimeoutMs(): number {
	const raw = env.PIRATE_CLAW_NAV_API_TIMEOUT_MS;
	const parsed = raw ? Number(raw) : NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : NAV_TIMEOUT_MS;
}

export function buildApiUrl(path: string): string {
	const baseUrl = (env.PIRATE_CLAW_API_URL ?? '').replace(/\/$/, '');
	if (!baseUrl) {
		throw new Error('PIRATE_CLAW_API_URL is required but not set');
	}
	return `${baseUrl}${path}`;
}

/** Fetches the daemon with a bounded timeout and logs every call's outcome
 * (status + duration, or the failure) so a hung page load leaves a trace —
 * this is the single choke point almost every server-side route goes
 * through, so instrumenting it here covers them all. `timeoutOverrideMs`,
 * when given, replaces the usual DEFAULT_TIMEOUT_MS/env-var budget — used
 * by navApiRequest for the shorter nav-blocking budget. Every call also
 * logs how many other apiRequest calls were in flight at the same moment
 * (see request-context.ts), which is what makes a contention-driven slow
 * patch ("nothing individually broken, just too much at once") visible in
 * the logs instead of looking identical to one genuinely slow call. */
export async function apiRequest(
	path: string,
	init?: Parameters<typeof fetch>[1],
	timeoutOverrideMs?: number
): Promise<Response> {
	const url = buildApiUrl(path);
	const method = init?.method ?? 'GET';
	const limitMs = timeoutOverrideMs ?? timeoutMs();
	const timeoutSignal = AbortSignal.timeout(limitMs);
	const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;

	const inflight = beginApiCall();
	try {
		return await logTimedRequest('[api]', method, path, () => fetch(url, { ...init, signal }), {
			timeoutDetail: `limit ${limitMs}ms`,
			isCallerAbort: () => init?.signal?.aborted ?? false,
			note: `inflight=${inflight}`
		});
	} finally {
		endApiCall();
	}
}

function throwIfNotOk(path: string, res: Response): void {
	if (!res.ok) {
		throw new Error(`API request failed: ${res.status} ${res.statusText} — ${buildApiUrl(path)}`);
	}
}

export async function apiFetch<T>(path: string): Promise<T> {
	const res = await apiRequest(path);
	throwIfNotOk(path, res);
	return res.json() as Promise<T>;
}

/** Like apiRequest, but for calls a page/layout `load` awaits before the
 * navigation can resolve — see NAV_TIMEOUT_MS for why this budget is short
 * rather than raised, and for which routes deliberately stay off it.
 * Retries once (network/timeout failures only — a non-ok HTTP response
 * doesn't throw here, see apiFetch, so it never reaches this retry loop;
 * retrying a real 4xx/5xx wouldn't help and would only hide the actual
 * error) after a short jittered delay (see NAV_RETRY_BASE_DELAY_MS) before
 * giving up, logging each attempt — tagged with the same request id as
 * every other [api] line (see request-context.ts) — so a repeat failure
 * shows up as `attempt 1/2` / `attempt 2/2` instead of one opaque error.
 * That log trail is the data to look at if these keep happening and the
 * budget/retry count need adjusting (PIRATE_CLAW_NAV_API_TIMEOUT_MS
 * overrides the budget without a redeploy). */
export async function navApiRequest(
	path: string,
	init?: Parameters<typeof fetch>[1]
): Promise<Response> {
	const limitMs = navTimeoutMs();
	let lastError: unknown;
	for (let attempt = 1; attempt <= NAV_MAX_ATTEMPTS; attempt++) {
		try {
			return await apiRequest(path, init, limitMs);
		} catch (error) {
			lastError = error;
			if (attempt >= NAV_MAX_ATTEMPTS) break;
			const method = init?.method ?? 'GET';
			const message = error instanceof Error ? error.message : String(error);
			const reqId = currentRequestId();
			const tag = reqId ? `[api]:${reqId}` : '[api]';
			const delayMs = NAV_RETRY_BASE_DELAY_MS + Math.round(Math.random() * NAV_RETRY_JITTER_MS);
			console.warn(
				`${tag} ${method} ${path} attempt ${attempt}/${NAV_MAX_ATTEMPTS} failed, retrying in ${delayMs}ms: ${message}`
			);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	throw lastError;
}

export async function navApiFetch<T>(path: string): Promise<T> {
	const res = await navApiRequest(path);
	throwIfNotOk(path, res);
	return res.json() as Promise<T>;
}
