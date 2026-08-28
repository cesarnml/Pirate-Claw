<script lang="ts">
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();
	const MAX_PENDING_RETRY_MS = 60_000;
	const DEFAULT_RETRY_DELAY_MS = 2_500;
	const PENDING_SINCE_PARAM = 'pendingSince';

	const pendingSinceMs = $derived(browser && data.pending ? readOrInitPendingSince() : NaN);
	const expiresAtMs = $derived(data.expiresAt ? Date.parse(data.expiresAt) : NaN);
	const timedOut = $derived(
		Boolean(data.pending) &&
			((Number.isFinite(pendingSinceMs) && Date.now() - pendingSinceMs >= MAX_PENDING_RETRY_MS) ||
				(Number.isFinite(expiresAtMs) && Date.now() >= expiresAtMs))
	);
	const connectHref = $derived(
		`/plex/connect?returnTo=${encodeURIComponent(data.returnTo ?? '/config')}`
	);

	$effect(() => {
		if (!browser) return;
		if (data.ok) {
			const timer = setTimeout(() => {
				window.location.href = data.returnTo ?? '/config';
			}, 2000);
			return () => clearTimeout(timer);
		}
		if (!data.pending || timedOut) return;
		// Honor a server-supplied backoff (set when Plex rate limited us) instead
		// of always reloading on the default cadence — reloading regardless of
		// why we're pending is what caused the reload loop and the daemon's own
		// internal poll loop to compound into a 429 storm against Plex.
		const delayMs = data.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
		const timer = setTimeout(() => {
			window.location.reload();
		}, delayMs);
		return () => clearTimeout(timer);
	});

	// Persist the first-seen pending timestamp in the URL so reload-driven retries
	// share a deadline instead of resetting on every refresh.
	function readOrInitPendingSince(): number {
		const currentUrl = new URL(window.location.href);
		const existing = Number.parseInt(currentUrl.searchParams.get(PENDING_SINCE_PARAM) ?? '', 10);
		if (Number.isFinite(existing)) return existing;
		const now = Date.now();
		currentUrl.searchParams.set(PENDING_SINCE_PARAM, String(now));
		window.history.replaceState(window.history.state, '', currentUrl.toString());
		return now;
	}
</script>

<svelte:head>
	<title>Plex Connection</title>
</svelte:head>

<div
	class="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center"
>
	<div class="space-y-2">
		<p
			class={`text-sm font-semibold tracking-[0.28em] uppercase ${
				data.ok
					? 'text-emerald-500'
					: data.pending && !timedOut
						? 'text-amber-400'
						: 'text-rose-500'
			}`}
		>
			{data.ok ? 'Connected' : data.pending && !timedOut ? 'Connecting' : 'Connection Failed'}
		</p>
		<h1 class="text-foreground text-3xl font-semibold">Plex Browser Auth</h1>
		<p class="text-muted-foreground text-sm">{data.message}</p>
		{#if data.ok}
			<p class="text-muted-foreground text-xs">Redirecting automatically…</p>
		{:else if data.pending && !timedOut}
			<p class="text-muted-foreground text-xs">
				Waiting for Plex to finish linking… retrying automatically.
			</p>
		{:else if data.pending && timedOut}
			<p class="text-muted-foreground text-xs">
				Still waiting after about a minute. Start a fresh connect attempt to try again.
			</p>
		{/if}
	</div>

	<Button href={timedOut ? connectHref : (data.returnTo ?? '/config')}>
		{timedOut
			? 'Start connect again'
			: data.returnTo === '/onboarding'
				? 'Continue setup'
				: 'Return to settings'}
	</Button>
</div>
