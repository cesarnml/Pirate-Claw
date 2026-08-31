<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';

	const props = $props<{ targetCount: number }>();

	let running = $state(false);
	let current = $state(0);
	let total = $state(0);
	let currentTitle = $state('');
	let failures = $state(0);
	let errorMessage = $state<string | null>(null);

	// Saves the chore of opening every show's detail page just to click its
	// own "Refresh Plex" button. Drives the same per-show refresh the detail
	// page uses, but sequentially and with a deliberate pause between shows
	// (see refresh-missing/+server.ts) — a Plex refresh storm across dozens
	// of shows at once is a real risk against a self-hosted server.
	async function runBulkRefresh() {
		if (running || props.targetCount === 0) return;

		running = true;
		current = 0;
		total = 0;
		currentTitle = '';
		failures = 0;
		errorMessage = null;

		try {
			const response = await fetch('/shows/refresh-missing', { method: 'POST' });
			if (!response.ok || !response.body) {
				errorMessage = 'Bulk Plex refresh failed to start.';
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					if (!line.trim()) continue;
					const event = JSON.parse(line);
					if (event.type === 'start') {
						total = event.total;
					} else if (event.type === 'progress') {
						current = event.index;
						total = event.total;
						currentTitle = event.title;
						if (!event.ok) failures += 1;
					} else if (event.type === 'fatal') {
						errorMessage = event.message;
					}
				}
			}
		} catch (error) {
			console.error('[shows] bulk Plex refresh interrupted:', error);
			errorMessage = 'Bulk Plex refresh was interrupted.';
		} finally {
			running = false;
			await invalidateAll();
		}
	}
</script>

<div class="flex flex-col items-end gap-1">
	<Button
		variant="outline"
		size="sm"
		onclick={runBulkRefresh}
		disabled={running || props.targetCount === 0}
	>
		{#if running}
			<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
			Refreshing {current}/{total}…
		{:else}
			<RefreshCcwIcon class="mr-2 h-4 w-4" />
			Refresh Plex ({props.targetCount})
		{/if}
	</Button>
	{#if running && currentTitle}
		<p class="text-muted-foreground max-w-56 truncate text-right text-[11px]">{currentTitle}</p>
	{/if}
	{#if !running && errorMessage}
		<p class="max-w-56 text-right text-[11px] text-red-400">{errorMessage}</p>
	{/if}
	{#if !running && !errorMessage && failures > 0}
		<p class="max-w-56 text-right text-[11px] text-amber-300">
			{failures} show{failures === 1 ? '' : 's'} failed to refresh.
		</p>
	{/if}
</div>
