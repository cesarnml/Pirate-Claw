<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import type { FeedConfig } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface Props {
		feedsList: FeedConfig[];
		newFeedName: string;
		newFeedUrl: string;
		newFeedMediaType: 'tv' | 'movie';
		canWrite: boolean;
		currentEtag: string | null;
		feedsSubmitting: boolean;
		writeDisabledTooltip: string;
		feedsMessage?: string;
		feedsUrlError?: string;
		enhanceSaveFeeds: SubmitFunction;
		onRemoveFeed: (index: number) => void;
		onNewFeedNameChange: (value: string) => void;
		onNewFeedUrlChange: (value: string) => void;
		onNewFeedMediaTypeChange: (value: 'tv' | 'movie') => void;
	}

	const {
		feedsList,
		newFeedName,
		newFeedUrl,
		newFeedMediaType,
		canWrite,
		currentEtag,
		feedsSubmitting,
		writeDisabledTooltip,
		feedsMessage,
		feedsUrlError,
		enhanceSaveFeeds,
		onRemoveFeed,
		onNewFeedNameChange,
		onNewFeedUrlChange,
		onNewFeedMediaTypeChange
	}: Props = $props();
</script>

<Card class="bg-card/75 rounded-[30px] border-white/10">
	<CardHeader class="space-y-4">
		<div class="space-y-1">
			<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
				02 · RSS Ingestion Hubs
			</p>
			<h2 class="text-2xl font-semibold tracking-[-0.03em]">RSS Feeds</h2>
		</div>
	</CardHeader>
	<CardContent>
		<form method="POST" action="?/saveFeeds" class="space-y-5" use:enhance={enhanceSaveFeeds}>
			<input type="hidden" name="feedsIfMatch" value={currentEtag ?? ''} />
			<input type="hidden" name="existingFeedsJson" value={JSON.stringify(feedsList)} />

			{#if feedsList.length === 0}
				<p class="text-muted-foreground text-sm">No feeds configured yet.</p>
			{:else}
				<ul class="grid list-none gap-3">
					{#each feedsList as feed, index}
						<li
							class="border-border bg-background/50 flex items-center justify-between gap-3 rounded-2xl border p-3"
						>
							<div class="min-w-0 space-y-2">
								<div class="flex flex-wrap items-center gap-2">
									<p class="font-semibold">{feed.name}</p>
									<Badge variant="secondary" class="bg-white/8 text-slate-200">
										{feed.mediaType === 'tv' ? 'TV_SHOWS' : 'MOVIES'}
									</Badge>
								</div>
								<p class="text-muted-foreground text-sm break-all">{feed.url}</p>
							</div>
							<button
								type="button"
								class="border-border text-muted-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full border text-lg disabled:opacity-50"
								disabled={!canWrite || feedsSubmitting}
								title={!canWrite ? writeDisabledTooltip : undefined}
								aria-label={`Remove feed ${feed.name}`}
								onclick={() => onRemoveFeed(index)}
							>
								×
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="bg-background/40 grid gap-3 rounded-[24px] border border-white/8 p-4">
				<p
					class="text-muted-foreground font-mono text-xs font-semibold tracking-[0.18em] uppercase"
				>
					Add Feed
				</p>
				<input
					name="newFeedName"
					type="text"
					placeholder="Feed name"
					value={newFeedName}
					disabled={!canWrite || feedsSubmitting}
					class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					oninput={(event) => onNewFeedNameChange(event.currentTarget.value)}
				/>
				<div class="space-y-1">
					<input
						name="newFeedUrl"
						type="url"
						placeholder="https://example.com/feed.rss"
						value={newFeedUrl}
						disabled={!canWrite || feedsSubmitting}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
						oninput={(event) => onNewFeedUrlChange(event.currentTarget.value)}
					/>
					{#if feedsUrlError}
						<p class="text-destructive text-xs">{feedsUrlError}</p>
					{/if}
				</div>
				<select
					name="newFeedMediaType"
					value={newFeedMediaType}
					disabled={!canWrite || feedsSubmitting}
					class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					onchange={(event) =>
						onNewFeedMediaTypeChange(event.currentTarget.value as 'tv' | 'movie')}
				>
					<option value="tv">TV</option>
					<option value="movie">Movie</option>
				</select>
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					class="rounded-full px-5"
					disabled={!canWrite || !currentEtag || feedsSubmitting}
					title={!canWrite ? writeDisabledTooltip : undefined}
				>
					Save feeds
				</Button>
				{#if feedsMessage}
					<p class="text-destructive text-xs">{feedsMessage}</p>
				{/if}
			</div>
		</form>
	</CardContent>
</Card>
