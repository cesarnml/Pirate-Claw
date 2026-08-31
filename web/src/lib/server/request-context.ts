import { AsyncLocalStorage } from 'node:async_hooks';

// 2026-08-31 page-transition-timeout investigation: correlating a slow
// [route] line to the specific [api] calls that caused it required
// eyeballing timestamps, which falls apart the moment two navigations
// overlap (exactly what a burst of concurrent shows/[slug] loads plus a
// background bulk Plex refresh produced). This gives every top-level
// request a short id that flows through to every [api] log line it
// triggers, so `grep <id>` reconstructs one request's full call graph.
const requestIdStorage = new AsyncLocalStorage<string>();

/** Runs `fn` with a fresh request id attached to the async context — call
 * once per top-level request (see hooks.server.ts's timedResolve, the only
 * caller) so every nested apiRequest during that resolve shares one id. */
export function runWithRequestId<T>(fn: () => T): T {
	const id = crypto.randomUUID().slice(0, 8);
	return requestIdStorage.run(id, fn);
}

export function currentRequestId(): string | null {
	return requestIdStorage.getStore() ?? null;
}

// Process-wide count of outbound daemon calls currently in flight (across
// all requests, not just the current one). A log line can't otherwise
// answer "was this slow because N other calls were competing for the
// daemon at the same moment?" without standing up a metrics stack — this
// is the cheap version. See api.ts's apiRequest, the sole reader/writer.
let inFlightCount = 0;

/** Marks one outbound call as started and returns the in-flight count
 * including it (i.e. the snapshot to log alongside that call). */
export function beginApiCall(): number {
	inFlightCount += 1;
	return inFlightCount;
}

export function endApiCall(): void {
	inFlightCount = Math.max(0, inFlightCount - 1);
}
