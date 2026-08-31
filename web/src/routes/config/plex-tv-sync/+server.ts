import { env } from '$env/dynamic/private';
import { apiFetch, apiRequest } from '$lib/server/api';
import { streamNdjsonProgress } from '$lib/server/ndjson-progress';
import { showDisplayTitle } from '$lib/helpers';
import type { ShowBreakdown } from '$lib/types';
import type { RequestHandler } from './$types';

// The streaming sibling of shows/refresh-missing — same sequential/gentle/
// cancelable shape (see streamNdjsonProgress), but scoped to EVERY tracked
// show rather than just the ones missing episodes, since that's what "Plex
// TV Sync" means on the Config page: force-recheck everything right now.
// Deliberately reuses the same per-show /api/shows/:slug/plex/refresh
// endpoint the shows page already drives, rather than the lighter
// single-searchShows() check runFullTvPlexSync's own loop does — a bit
// more work per show (whole-show flag + season completions, same as a
// single show's own "Refresh Plex" button), but it means this route needs
// zero new daemon-side per-show logic, and the result is at least as fresh
// as the old sweep, not less. See REFRESH_DELAY_MS in refresh-missing for
// why the same delay applies here.
const REFRESH_DELAY_MS = 800;

export const POST: RequestHandler = async () => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return Response.json(
			{ error: 'Plex TV sync is unavailable without API write access.' },
			{ status: 403 }
		);
	}

	const response = streamNdjsonProgress<ShowBreakdown, { title: string }>({
		logTag: '[config plex-tv-sync]',
		async loadItems() {
			return (await apiFetch<{ shows: ShowBreakdown[] }>('/api/shows')).shows;
		},
		async runItem(show, signal) {
			const res = await apiRequest(
				`/api/shows/${encodeURIComponent(show.normalizedTitle)}/plex/refresh`,
				{
					method: 'POST',
					headers: { authorization: `Bearer ${writeToken}` },
					signal
				}
			);
			return { title: showDisplayTitle(show), ok: res.ok };
		},
		onItemError: (show) => ({ title: showDisplayTitle(show) }),
		delayMs: REFRESH_DELAY_MS
	});

	// Stamp "last synced at" once the sweep actually finishes, then append
	// one more NDJSON line reporting the server-confirmed result — see
	// recordSyncAfterStream's own doc comment for why this pipes through
	// instead of tee()ing, and why the client needs this extra line rather
	// than just timestamping itself the moment the stream ends.
	return recordSyncAfterStream(response, writeToken);
};

/** Pipes the progress stream through (not tee()s it — see below) so this
 * route can both hand the client live bytes AND observe when the run
 * actually finishes (a `done` event, not just "the HTTP response
 * started") to stamp last-synced-at exactly once, server-side, appending
 * one final `synced`/`sync-record-failed` line with the real outcome
 * before closing.
 *
 * Deliberately NOT response.body.tee(): tee() only cancels the underlying
 * source once BOTH branches are cancelled/drained, so a client that
 * disconnects mid-run (nav away, tab close) would leave this route's own
 * background reader still consuming the tee'd stream to completion — the
 * per-show refresh loop's cancel-on-disconnect path (streamNdjsonProgress's
 * whole reason for existing) would never actually fire. Piping through a
 * TransformStream instead means a client cancel propagates back through
 * the pipe to the daemon fetch's reader, same as if there were no relay at
 * all — this route only *observes* passing bytes, it doesn't fork them.
 * Found in code review before this ever shipped. */
function recordSyncAfterStream(response: Response, writeToken: string): Response {
	if (!response.body) return response;

	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = '';
	let sawDone = false;

	const transform = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			controller.enqueue(chunk);
			buffer += decoder.decode(chunk, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const event = JSON.parse(line) as { type: string };
				if (event.type === 'done') sawDone = true;
			}
		},
		// Only runs when the source stream ends normally — a client cancel
		// aborts the pipe instead, so flush() never fires and no
		// recordOnly call happens for a run nobody's waiting on anymore.
		async flush(controller) {
			if (!sawDone) return;
			try {
				const res = await apiRequest('/api/shows/plex-sync?recordOnly=true', {
					method: 'POST',
					headers: { authorization: `Bearer ${writeToken}` }
				});
				const body = (await res.json()) as { lastSyncedAt?: string | null };
				controller.enqueue(
					encoder.encode(
						`${JSON.stringify({ type: 'synced', lastSyncedAt: body.lastSyncedAt ?? null })}\n`
					)
				);
			} catch (error) {
				console.error('[config plex-tv-sync] failed to record sync completion:', error);
				controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'sync-record-failed' })}\n`));
			}
		}
	});

	return new Response(response.body.pipeThrough(transform), {
		headers: response.headers
	});
}
