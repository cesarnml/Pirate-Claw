<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { formatRelativeTime } from '$lib/helpers';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	// Walking Plex's whole movie catalog is expensive enough (~7000 movies
	// on a real library takes real seconds) that it's a deliberate,
	// occasional action here — not something Movie Calendar/Top Movies of
	// Year triggers automatically per view anymore. See
	// src/api.ts's runFullMoviePlexSync doc comment for the full story
	// (moved here per user feedback 2026-08-29: "pay the price once").
	interface Props {
		canWrite: boolean;
		syncing: boolean;
		lastSyncedAt: string | null;
		writeDisabledTooltip: string;
		enhancePlexMovieSync: SubmitFunction;
	}

	const { canWrite, syncing, lastSyncedAt, writeDisabledTooltip, enhancePlexMovieSync }: Props =
		$props();
</script>

<Card class="border-border/70 bg-card/80 rounded-3xl border shadow-sm">
	<CardHeader>
		<h2 class="text-lg font-semibold">Plex Movie Sync</h2>
		<p class="text-muted-foreground text-sm">
			Checks every movie from every year of Top Movies of Year you've ever viewed against your whole
			Plex library, so movies already in Plex from before pirate-claw existed show as owned —
			without re-checking Plex on every page view. Runs once automatically the first time you ever
			open the Movie Calendar; after that, it's manual.
		</p>
	</CardHeader>
	<CardContent>
		<form
			method="POST"
			action="?/plexMovieSync"
			use:enhance={enhancePlexMovieSync}
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
