<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { formatRelativeTime } from '$lib/helpers';
	import { readNdjsonStream } from '$lib/ndjson';
	import { toast } from '$lib/toast';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	// Movie-shaped sibling of PlexMovieSyncCard — see src/api.ts's
	// runFullTvPlexSync doc comment. Every tracked show already gets its
	// Plex status refreshed on the normal background-refresh interval; this
	// button just forces that same refresh right now instead of waiting,
	// which also doubles as the one manual way to repair a show's cached
	// status after a run of Plex timeouts.
	//
	// Streams live per-show progress the same way shows' own bulk Plex
	// refresh does (config/plex-tv-sync/+server.ts, built on the shared
	// streamNdjsonProgress helper) rather than sitting behind one opaque
	// "Syncing…" spinner for however long the whole tracked-show list takes.
	interface Props {
		canWrite: boolean;
		lastSyncedAt: string | null;
		writeDisabledTooltip: string;
	}

	const { canWrite, lastSyncedAt: initialLastSyncedAt, writeDisabledTooltip }: Props = $props();

	type ProgressEvent =
		| { type: 'start'; total: number }
		| { type: 'progress'; index: number; total: number; title: string; ok: boolean }
		| { type: 'fatal'; message: string }
		| { type: 'done' }
		// Appended by config/plex-tv-sync/+server.ts after the stream's own
		// `done`, once it's confirmed the server actually recorded the sync —
		// the real outcome, not a client-side guess (see that route's
		// recordSyncAfterStream doc comment for why a plain `new
		// Date().toISOString()` here would lie if the server-side record call
		// failed).
		| { type: 'synced'; lastSyncedAt: string | null }
		| { type: 'sync-record-failed' };

	let running = $state(false);
	let current = $state(0);
	let total = $state(0);
	let currentTitle = $state('');
	let failures = $state(0);
	// undefined = "no run yet this page view, show the server-loaded value";
	// see ShowsBulkPlexRefreshButton and the movie-calendar rescan card for
	// the same pattern — a fresh navApiRequest re-load would go stale the
	// moment a run finishes without this override.
	let lastSyncedAtOverride = $state<string | null | undefined>(undefined);
	const lastSyncedAt = $derived(
		lastSyncedAtOverride !== undefined ? lastSyncedAtOverride : initialLastSyncedAt
	);

	async function runSync() {
		if (running) return;

		running = true;
		current = 0;
		total = 0;
		currentTitle = '';
		failures = 0;

		try {
			const response = await fetch('/config/plex-tv-sync', { method: 'POST' });
			if (!response.ok || !response.body) {
				toast('Plex sync failed', 'error', 'Plex TV sync failed to start.');
				return;
			}

			let fatalMessage: string | null = null;
			let syncRecordFailed = false;
			await readNdjsonStream<ProgressEvent>(response, (event) => {
				if (event.type === 'start') {
					total = event.total;
				} else if (event.type === 'progress') {
					current = event.index;
					total = event.total;
					currentTitle = event.title;
					if (!event.ok) failures += 1;
				} else if (event.type === 'fatal') {
					fatalMessage = event.message;
				} else if (event.type === 'synced') {
					lastSyncedAtOverride = event.lastSyncedAt;
				} else if (event.type === 'sync-record-failed') {
					syncRecordFailed = true;
				}
			});

			if (fatalMessage) {
				toast('Plex sync failed', 'error', fatalMessage);
			} else if (syncRecordFailed) {
				// The per-show sweep itself completed fine — only the final
				// "stamp last synced at" write failed server-side. Don't set
				// lastSyncedAtOverride: leave the displayed value as whatever
				// it was before this run rather than claiming a sync that
				// isn't actually recorded.
				toast(
					'Plex sync ran, but last-synced time failed to save',
					'error',
					`Re-checked ${total} tracked show${total === 1 ? '' : 's'} against your Plex library, but recording the sync time failed — try again.`
				);
			} else {
				toast(
					'Plex sync complete',
					'success',
					failures > 0
						? `Re-checked ${total} tracked show${total === 1 ? '' : 's'} against your Plex library (${failures} failed to refresh).`
						: `Re-checked ${total} tracked show${total === 1 ? '' : 's'} against your Plex library.`
				);
			}
		} catch (error) {
			console.error('[config] Plex TV sync interrupted:', error);
			toast('Plex sync failed', 'error', 'Plex TV sync was interrupted.');
		} finally {
			running = false;
			await invalidateAll();
		}
	}
</script>

<Card class="border-border/70 bg-card/80 rounded-3xl border shadow-sm">
	<CardHeader>
		<h2 class="text-lg font-semibold">Plex TV Sync</h2>
		<p class="text-muted-foreground text-sm">
			Checks every currently tracked show against your Plex library right now, instead of waiting
			for the next background refresh — useful right after a run of Plex errors to re-verify shows
			whose cached status might be stale.
		</p>
	</CardHeader>
	<CardContent>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="text-muted-foreground text-sm">
				{#if lastSyncedAt}
					Last synced {formatRelativeTime(lastSyncedAt)}
				{:else}
					Never synced.
				{/if}
				{#if running && currentTitle}
					<p class="text-foreground/80 mt-1 truncate text-[11px]">{currentTitle}</p>
				{/if}
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
					Syncing {current}/{total}…
				{:else}
					Sync Now
				{/if}
			</Button>
		</div>
	</CardContent>
</Card>
