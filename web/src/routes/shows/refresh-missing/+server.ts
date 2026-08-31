import { env } from '$env/dynamic/private';
import { apiFetch, apiRequest } from '$lib/server/api';
import { computeShowCompletion, showDisplayTitle } from '$lib/helpers';
import type { ShowBreakdown } from '$lib/types';
import type { RequestHandler } from './$types';

// Deliberately sequential, one show at a time, with a pause between each —
// this is the bulk version of the shows/[slug] "Refresh Plex" button, and
// that per-show refresh already makes two Plex round trips (whole-show flag,
// then a best-effort per-season completion walk). Firing that back-to-back
// for every missing show with zero gap would be a real storm against a
// self-hosted Plex server; the delay below is a deliberate cushion, not
// incidental.
const REFRESH_DELAY_MS = 800;

type ProgressEvent =
	| { type: 'start'; total: number }
	| { type: 'progress'; index: number; total: number; title: string; ok: boolean }
	| { type: 'fatal'; message: string }
	| { type: 'done' };

export const POST: RequestHandler = async () => {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (!writeToken) {
		return Response.json(
			{ error: 'Plex refresh is unavailable without API write access.' },
			{ status: 403 }
		);
	}

	const encoder = new TextEncoder();
	// Set by cancel() when the client disconnects (navigates away, closes
	// the tab) mid-run. Checked before each iteration, and the in-flight
	// apiRequest is aborted too — without this, a disconnect wouldn't stop
	// the loop until the next controller.enqueue() throws, letting one more
	// live Plex refresh fire against a server nobody's waiting on anymore.
	const abortController = new AbortController();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: ProgressEvent) => {
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};

			let shows: ShowBreakdown[];
			try {
				shows = (await apiFetch<{ shows: ShowBreakdown[] }>('/api/shows')).shows;
			} catch (error) {
				console.error('[shows refresh-missing] failed to load /api/shows:', error);
				send({ type: 'fatal', message: 'Could not reach the API.' });
				controller.close();
				return;
			}

			// Same target set the button's own count is built from: shows with
			// confirmed missing episodes, plus shows whose completion has never
			// been checked (status null) — those might turn out missing too.
			const targets = shows.filter((show) => {
				const status = computeShowCompletion(show).status;
				return status === 'missing' || status === null;
			});

			send({ type: 'start', total: targets.length });

			for (let index = 0; index < targets.length; index++) {
				if (abortController.signal.aborted) return;

				const show = targets[index];
				let ok = false;
				try {
					const response = await apiRequest(
						`/api/shows/${encodeURIComponent(show.normalizedTitle)}/plex/refresh`,
						{
							method: 'POST',
							headers: { authorization: `Bearer ${writeToken}` },
							signal: abortController.signal
						}
					);
					ok = response.ok;
				} catch (error) {
					if (abortController.signal.aborted) return;
					console.error(
						`[shows refresh-missing] refresh failed for ${show.normalizedTitle}:`,
						error
					);
				}

				if (abortController.signal.aborted) return;
				send({
					type: 'progress',
					index: index + 1,
					total: targets.length,
					title: showDisplayTitle(show),
					ok
				});

				if (index < targets.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, REFRESH_DELAY_MS));
				}
			}

			if (abortController.signal.aborted) return;
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
};
