<script lang="ts">
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	$effect(() => {
		if (!browser || !data.ok) return;
		const timer = setTimeout(() => {
			window.location.href = data.returnTo ?? '/config';
		}, 2000);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>Plex Connection</title>
</svelte:head>

<div
	class="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center"
>
	<div class="space-y-2">
		<p
			class={`text-sm font-semibold tracking-[0.28em] uppercase ${data.ok ? 'text-emerald-500' : 'text-rose-500'}`}
		>
			{data.ok ? 'Connected' : 'Connection Failed'}
		</p>
		<h1 class="text-foreground text-3xl font-semibold">Plex Browser Auth</h1>
		<p class="text-muted-foreground text-sm">{data.message}</p>
		{#if data.ok}
			<p class="text-muted-foreground text-xs">Redirecting automatically…</p>
		{/if}
	</div>

	<Button href={data.returnTo ?? '/config'}
		>{data.returnTo === '/onboarding' ? 'Continue setup' : 'Return to settings'}</Button
	>
</div>
