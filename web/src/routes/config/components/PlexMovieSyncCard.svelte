<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { formatRelativeTime } from '$lib/helpers';
	import { readNdjsonStream } from '$lib/ndjson';
	import { toast } from '$lib/toast';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	// Walking Plex's whole movie catalog is expensive enough (~7000 movies
	// on a real library takes real seconds) that it's a deliberate,
	// occasional action here — not something Movie Calendar/Top Movies of
	// Year triggers automatically per view anymore. See
	// src/api.ts's runFullMoviePlexSync doc comment for the full story
	// (moved here per user feedback 2026-08-29: "pay the price once").
	//
	// Streams a coarse checked/total counter (config/plex-movie-sync/+server.ts
	// → streamMoviePlexSyncProgress) instead of one opaque "Syncing…"
	// spinner. Unlike shows/TV sync, this work has no per-item network call
	// to pace — one Plex catalog fetch, then an in-memory match against every
	// candidate — so this is honest "how far along is it" feedback, not the
	// same sequential/gentle pattern; see that route's doc comment.
	interface Props {
		canWrite: boolean;
		/** False when Plex isn't connected — this card can't do anything
		 * without it, so it fades and its button disables regardless of
		 * canWrite (see the config page's plexHealthy derivation). */
		plexHealthy: boolean;
		lastSyncedAt: string | null;
		/** Last time the automatic background sweep touched every movie —
		 * distinct from lastSyncedAt (manual "Sync Now" / one-time bootstrap
		 * only). Null if it's never run. */
		lastAutoRefreshedAt: string | null;
		writeDisabledTooltip: string;
	}

	const {
		canWrite,
		plexHealthy,
		lastSyncedAt: initialLastSyncedAt,
		lastAutoRefreshedAt,
		writeDisabledTooltip
	}: Props = $props();

	type ProgressEvent =
		| { type: 'progress'; checked: number; total: number }
		| { type: 'fatal'; message: string }
		| {
				type: 'done';
				lastSyncedAt: string | null;
				adoptedCount: number;
				checkedCount: number;
		  };

	let running = $state(false);
	let checked = $state(0);
	let total = $state(0);
	// undefined = "no run yet this page view, show the server-loaded value" —
	// same pattern as PlexTvSyncCard.
	let lastSyncedAtOverride = $state<string | null | undefined>(undefined);
	const lastSyncedAt = $derived(
		lastSyncedAtOverride !== undefined ? lastSyncedAtOverride : initialLastSyncedAt
	);

	async function runSync() {
		if (running) return;

		running = true;
		checked = 0;
		total = 0;

		try {
			const response = await fetch('/config/plex-movie-sync', { method: 'POST' });
			if (!response.ok || !response.body) {
				toast('Plex sync failed', 'error', 'Plex movie sync failed to start.');
				return;
			}

			let fatalMessage: string | null = null;
			let doneResult: Extract<ProgressEvent, { type: 'done' }> | null = null;
			await readNdjsonStream<ProgressEvent>(response, (event) => {
				if (event.type === 'progress') {
					checked = event.checked;
					total = event.total;
				} else if (event.type === 'fatal') {
					fatalMessage = event.message;
				} else if (event.type === 'done') {
					doneResult = event;
				}
			});

			if (fatalMessage) {
				toast('Plex sync failed', 'error', fatalMessage);
			} else if (doneResult) {
				const result = doneResult as Extract<ProgressEvent, { type: 'done' }>;
				lastSyncedAtOverride = result.lastSyncedAt;
				toast(
					'Plex sync complete',
					'success',
					`Re-synced your whole Plex library, then checked it against ${result.checkedCount} known movie${result.checkedCount === 1 ? '' : 's'} — found ${result.adoptedCount} already there.`
				);
			}
		} catch (error) {
			console.error('[config] Plex movie sync interrupted:', error);
			toast('Plex sync failed', 'error', 'Plex movie sync was interrupted.');
		} finally {
			running = false;
			await invalidateAll();
		}
	}
</script>

<Card
	class={`border-border/70 bg-card/80 rounded-3xl border shadow-sm transition-opacity ${!plexHealthy ? 'opacity-50' : ''}`}
>
	<CardHeader>
		<h2 class="text-lg font-semibold">Plex Movie Sync</h2>
		<p class="text-muted-foreground text-sm">
			Checks every movie from every year of Top Movies of Year you've ever viewed against your whole
			Plex library, so movies already in Plex from before pirate-claw existed show as owned —
			without re-checking Plex on every page view. Runs once automatically the first time you ever
			open the Movie Calendar; after that, it's manual.
		</p>
		{#if !plexHealthy}
			<p class="text-xs font-medium text-amber-400">Connect Plex to use this.</p>
		{/if}
	</CardHeader>
	<CardContent>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="text-muted-foreground text-sm">
				<p>
					{#if lastSyncedAt}
						Last manual sync {formatRelativeTime(lastSyncedAt)}
					{:else}
						Never manually synced.
					{/if}
				</p>
				<p>
					{#if lastAutoRefreshedAt}
						Last automatic refresh {formatRelativeTime(lastAutoRefreshedAt)}
					{:else}
						Never automatically refreshed.
					{/if}
				</p>
			</div>
			<Button
				type="button"
				variant="outline"
				class="rounded-full px-5"
				disabled={!canWrite || running}
				title={!canWrite ? writeDisabledTooltip : undefined}
				onclick={runSync}
			>
				{#if running}
					<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
					{#if total > 0}
						Syncing {checked}/{total}…
					{:else}
						Syncing…
					{/if}
				{:else}
					Sync Now
				{/if}
			</Button>
		</div>
	</CardContent>
</Card>
