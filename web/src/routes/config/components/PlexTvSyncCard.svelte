<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { formatRelativeTime } from '$lib/helpers';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	// Movie-shaped sibling of PlexMovieSyncCard — see src/api.ts's
	// runFullTvPlexSync doc comment. Every tracked show already gets its
	// Plex status refreshed on the normal background-refresh interval; this
	// button just forces that same refresh right now instead of waiting,
	// which also doubles as the one manual way to repair a show's cached
	// status after a run of Plex timeouts.
	interface Props {
		canWrite: boolean;
		syncing: boolean;
		lastSyncedAt: string | null;
		writeDisabledTooltip: string;
		enhancePlexTvSync: SubmitFunction;
	}

	const { canWrite, syncing, lastSyncedAt, writeDisabledTooltip, enhancePlexTvSync }: Props =
		$props();
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
		<form
			method="POST"
			action="?/plexTvSync"
			use:enhance={enhancePlexTvSync}
			class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-muted-foreground text-sm">
				{#if lastSyncedAt}
					Last synced {formatRelativeTime(lastSyncedAt)}
				{:else}
					Never synced.
				{/if}
			</p>
			<Button
				type="submit"
				variant="outline"
				class="rounded-full px-5"
				disabled={!canWrite || syncing}
				title={!canWrite ? writeDisabledTooltip : undefined}
			>
				{#if syncing}
					<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
					Syncing…
				{:else}
					Sync Now
				{/if}
			</Button>
		</form>
	</CardContent>
</Card>
