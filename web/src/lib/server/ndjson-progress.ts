import { currentRequestId } from './request-context';

/** Shared shape every bulk-action progress stream in this app sends —
 * extracted 2026-08-31 from shows/refresh-missing's original endpoint (the
 * reference implementation this generalizes) so Config's Plex TV sync gets
 * the same sequential/gentle/streaming/cancelable behavior without
 * reimplementing the loop. `E` is the feature-specific fields a progress
 * event carries alongside index/total/ok (e.g. `{ title: string }`). */
export type BulkProgressEvent<E extends Record<string, unknown>> =
	| { type: 'start'; total: number }
	| ({ type: 'progress'; index: number; total: number; ok: boolean } & E)
	| { type: 'fatal'; message: string }
	| { type: 'done' };

export type StreamNdjsonProgressOptions<T, E extends Record<string, unknown>> = {
	/** Tag prefixed to every log line for this run, e.g.
	 * '[config tv-sync]' — combined with the current request id, same as
	 * the reference implementation, so one run's lines are grep-able. */
	logTag: string;
	/** Loads the list of items to process. Runs once, before the first
	 * `start` event — a failure here sends a `fatal` event and ends the
	 * stream instead of starting the loop. */
	loadItems: () => Promise<T[]>;
	/** Runs one item and reports the fields to attach to its `progress`
	 * event (e.g. `{ title, ok }`). A thrown error is treated the same as
	 * a returned `ok: false` — logged, counted as a failure, loop
	 * continues — so callers don't need their own try/catch for the
	 * common "this one item failed" case. */
	runItem: (item: T, signal: AbortSignal) => Promise<E & { ok: boolean }>;
	/** Delay between items, skipped after the last one and skipped
	 * entirely when omitted. See shows/refresh-missing's original
	 * REFRESH_DELAY_MS doc comment: only needed when `runItem` makes a
	 * real outbound call per item that could storm a self-hosted service
	 * back-to-back — omit for in-memory-only work. */
	delayMs?: number;
	/** Label used when `runItem` throws, for the ok:false event's `E`
	 * fields — e.g. `(item) => ({ title: item.title })`. */
	onItemError: (item: T, error: unknown) => E;
};

/** Builds the NDJSON streaming Response for a sequential, cancelable bulk
 * operation — the mechanics shared by shows' bulk Plex refresh, Config's
 * Plex TV sync, and any future bulk action: one item at a time (never
 * parallel), an optional gentle delay between items, live progress
 * streamed as newline-delimited JSON, and a cancel-on-disconnect path that
 * stops the loop and aborts the in-flight item promptly rather than
 * leaving it running unattended. See shows/refresh-missing/+server.ts's
 * original inline version (pre-2026-08-31 extraction) for the full
 * rationale this generalizes from. */
export function streamNdjsonProgress<T, E extends Record<string, unknown>>(
	options: StreamNdjsonProgressOptions<T, E>
): Response {
	const { logTag: baseLogTag, loadItems, runItem, delayMs, onItemError } = options;
	const encoder = new TextEncoder();
	// Set by cancel() when the client disconnects mid-run. Checked before
	// each iteration, and passed into runItem so an in-flight outbound call
	// is aborted too — without this, a disconnect wouldn't stop the loop
	// until the next controller.enqueue() throws.
	const abortController = new AbortController();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: BulkProgressEvent<E>) => {
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};

			const reqId = currentRequestId();
			const logTag = reqId ? `${baseLogTag}:${reqId}` : baseLogTag;
			const startedAt = Date.now();
			let succeeded = 0;
			let failed = 0;
			const logCancelled = (notStarted: number) => {
				console.log(
					`${logTag} cancelled after ${Date.now() - startedAt}ms: ${succeeded} ok, ${failed} failed, ${notStarted} not started`
				);
			};

			let items: T[];
			try {
				items = await loadItems();
			} catch (error) {
				console.error(`${logTag} failed to load items:`, error);
				send({ type: 'fatal', message: 'Could not reach the API.' });
				controller.close();
				return;
			}

			console.log(`${logTag} started: ${items.length} item(s)`);
			send({ type: 'start', total: items.length });

			for (let index = 0; index < items.length; index++) {
				if (abortController.signal.aborted) {
					logCancelled(items.length - index);
					return;
				}

				const item = items[index];
				let fields: E & { ok: boolean };
				try {
					fields = await runItem(item, abortController.signal);
				} catch (error) {
					if (abortController.signal.aborted) {
						logCancelled(items.length - index);
						return;
					}
					console.error(`${logTag} item failed:`, error);
					fields = { ...onItemError(item, error), ok: false } as E & { ok: boolean };
				}
				if (fields.ok) succeeded += 1;
				else failed += 1;

				if (abortController.signal.aborted) {
					logCancelled(items.length - index - 1);
					return;
				}
				send({ type: 'progress', index: index + 1, total: items.length, ...fields });

				if (delayMs && index < items.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, delayMs));
				}
			}

			if (abortController.signal.aborted) {
				logCancelled(0);
				return;
			}
			console.log(
				`${logTag} completed after ${Date.now() - startedAt}ms: ${succeeded} ok, ${failed} failed`
			);
			send({ type: 'done' });
			controller.close();
		},
		cancel() {
			abortController.abort();
		}
	});

	return new Response(stream, {
		headers: { 'content-type': 'application/x-ndjson; charset=utf-8' }
	});
}
