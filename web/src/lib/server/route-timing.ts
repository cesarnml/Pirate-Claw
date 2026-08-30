// Shared by api.ts (per-upstream-call timing) and hooks.server.ts (per-route
// timing) so the two logging shapes — and the "what counts as slow" bar —
// can't drift apart from being maintained twice.

/** Above this, a request is worth flagging as slow even though it
 * succeeded — escalates the log line to console.warn so `grep SLOW` finds
 * it without also matching every fast, unremarkable request. */
export const SLOW_REQUEST_MS = 5_000;

/** Runs `fn` (expected to resolve to a Response), logging its outcome as
 * `${prefix} METHOD path -> status (Nms)` — escalated to console.warn past
 * SLOW_REQUEST_MS — on success, or a failure/timeout line on error, then
 * rethrows so callers keep their existing error handling. `timeoutDetail`,
 * when given, is appended to the timeout line (e.g. the configured limit). */
export async function logTimedRequest(
	prefix: string,
	method: string,
	path: string,
	fn: () => Promise<Response>,
	options?: {
		timeoutDetail?: string;
		/** Called on an abort/timeout-shaped error to check whether it was
		 * actually the caller's own signal firing (not our timeout) — logged
		 * as a plain failure rather than a misleading "timed out" line. */
		isCallerAbort?: () => boolean;
	}
): Promise<Response> {
	const start = Date.now();
	try {
		const response = await fn();
		const elapsed = Date.now() - start;
		const slow = elapsed >= SLOW_REQUEST_MS;
		const log = slow ? console.warn : console.log;
		log(`${prefix}${slow ? ' SLOW' : ''} ${method} ${path} -> ${response.status} (${elapsed}ms)`);
		return response;
	} catch (error) {
		const elapsed = Date.now() - start;
		const timedOut =
			error instanceof Error &&
			(error.name === 'TimeoutError' || error.name === 'AbortError') &&
			!options?.isCallerAbort?.();
		if (timedOut) {
			const detail = options?.timeoutDetail ? ` (${options.timeoutDetail})` : '';
			console.error(`${prefix} ${method} ${path} timed out after ${elapsed}ms${detail}`);
		} else {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`${prefix} ${method} ${path} failed after ${elapsed}ms: ${message}`);
		}
		throw error;
	}
}
