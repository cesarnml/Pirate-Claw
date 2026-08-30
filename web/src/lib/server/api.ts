import { env } from '$env/dynamic/private';
import { logTimedRequest } from './route-timing';

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
const DEFAULT_TIMEOUT_MS = 60_000;

function timeoutMs(): number {
	const raw = env.PIRATE_CLAW_API_TIMEOUT_MS;
	const parsed = raw ? Number(raw) : NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
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
 * through, so instrumenting it here covers them all. */
export async function apiRequest(
	path: string,
	init?: Parameters<typeof fetch>[1]
): Promise<Response> {
	const url = buildApiUrl(path);
	const method = init?.method ?? 'GET';
	const limitMs = timeoutMs();
	const timeoutSignal = AbortSignal.timeout(limitMs);
	const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;

	return logTimedRequest('[api]', method, path, () => fetch(url, { ...init, signal }), {
		timeoutDetail: `limit ${limitMs}ms`,
		isCallerAbort: () => init?.signal?.aborted ?? false
	});
}

export async function apiFetch<T>(path: string): Promise<T> {
	const res = await apiRequest(path);
	if (!res.ok) {
		throw new Error(`API request failed: ${res.status} ${res.statusText} — ${buildApiUrl(path)}`);
	}
	return res.json() as Promise<T>;
}
