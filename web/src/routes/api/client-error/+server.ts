import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { apiRequest } from '$lib/server/api';

// Browser-facing sink for uncaught client-side rendering crashes (see the
// <svelte:boundary onerror={...}> in routes/calendar/+page.svelte). Same
// origin, no auth required from the browser — the sensitivity boundary is
// the write token on the daemon hop below, same as every other write path.
//
// Best-effort end to end: a failure here must never itself throw back at
// the boundary that's already mid-crash-recovery. Always logs locally
// first (visible via `docker logs pirate-claw-web` even if the daemon hop
// fails) and swallows any daemon-forward error rather than surfacing it.
export const POST = async ({ request }) => {
	let body: { message?: string; stack?: string; url?: string; label?: string };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false }, { status: 400 });
	}

	const message = typeof body.message === 'string' ? body.message : 'unknown error';
	console.error(
		`[client-error]${body.label ? ` [${body.label}]` : ''} ${message}`,
		body.url ? `(${body.url})` : '',
		body.stack ?? ''
	);

	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	if (writeToken) {
		try {
			await apiRequest('/api/client-error', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`
				},
				body: JSON.stringify(body)
			});
		} catch (error) {
			console.error('[client-error] forward to daemon failed:', error);
		}
	}

	return json({ ok: true });
};
