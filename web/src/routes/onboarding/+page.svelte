<script lang="ts">
	import { browser } from '$app/environment';
	import { writeOnboardingDismissed } from '$lib/onboarding';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import type { ActionData, PageData } from './$types';

	const { data, form }: { data: PageData; form?: ActionData } = $props();

	let selectedPath = $state<'tv' | 'movie' | 'both'>('tv');
	let feedMediaType = $state<'tv' | 'movie'>('tv');

	$effect(() => {
		feedMediaType = selectedPath === 'movie' ? 'movie' : 'tv';
	});

	function dismissOnboarding() {
		if (!browser) return;
		writeOnboardingDismissed(true);
		window.location.href = '/';
	}
</script>

<h1 class="text-3xl font-bold tracking-tight">Onboarding</h1>

{#if data.error}
	<Alert variant="destructive" class="mt-6" role="alert">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.onboarding?.state === 'writes_disabled'}
	<Alert class="mt-6">
		<AlertTitle>Config writes are disabled</AlertTitle>
		<AlertDescription>
			Enable config writes before using onboarding. You can still review the existing dashboard.
		</AlertDescription>
	</Alert>
{:else if data.onboarding?.state === 'ready'}
	<Alert class="mt-6">
		<AlertTitle>Onboarding already complete</AlertTitle>
		<AlertDescription>
			Your config already has at least one feed and one target. Continue in the
			<a href="/config" class="text-primary font-medium hover:underline">Config page</a>
			or return to the
			<a href="/" class="text-primary font-medium hover:underline">Dashboard</a>.
		</AlertDescription>
	</Alert>
{:else}
	<section class="mt-8 space-y-6">
		<Alert>
			<AlertTitle>
				{data.onboarding?.state === 'partial_setup' ? 'Resume onboarding' : 'First-time setup'}
			</AlertTitle>
			<AlertDescription>
				{#if data.onboarding?.state === 'partial_setup'}
					You already saved part of your config. Continue onboarding here or return to the
					<a href="/config" class="text-primary font-medium hover:underline">Config page</a>.
				{:else}
					Start by choosing your feed path and saving your first RSS feed.
				{/if}
			</AlertDescription>
		</Alert>

		{#if !(data.onboarding?.hasFeeds ?? false)}
			<div class="space-y-3">
				<h2 class="text-lg font-semibold tracking-tight">Step 1 — Feed type</h2>
				<div class="flex flex-wrap gap-3">
					<label class="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						<input type="radio" bind:group={selectedPath} value="tv" />
						<span>TV</span>
					</label>
					<label class="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						<input type="radio" bind:group={selectedPath} value="movie" />
						<span>Movie</span>
					</label>
					<label class="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						<input type="radio" bind:group={selectedPath} value="both" />
						<span>Both</span>
					</label>
				</div>
				<p class="text-muted-foreground text-sm">
					{selectedPath === 'both'
						? 'Both is supported. This first ticket saves one feed and leaves target setup for the next steps.'
						: `Your first feed will default to ${feedMediaType.toUpperCase()}.`}
				</p>
			</div>

			<div class="space-y-3">
				<h2 class="text-lg font-semibold tracking-tight">Step 2 — Add your first feed</h2>
				<form method="POST" action="?/saveFeed" class="space-y-4">
					<input type="hidden" name="ifMatch" value={form?.feedsEtag ?? data.etag ?? ''} />
					<input
						type="hidden"
						name="existingFeedsJson"
						value={JSON.stringify(data.config?.feeds ?? [])}
					/>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<label for="feed-name" class="text-sm font-medium">Feed name</label>
							<input
								id="feed-name"
								name="feedName"
								type="text"
								placeholder="TV Feed"
								class="border-input bg-background ring-offset-background h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="feed-type" class="text-sm font-medium">Feed media type</label>
							<select
								id="feed-type"
								name="feedMediaType"
								bind:value={feedMediaType}
								class="border-input bg-background ring-offset-background h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							>
								<option value="tv">TV</option>
								<option value="movie">Movie</option>
							</select>
						</div>
					</div>
					<div class="space-y-1">
						<label for="feed-url" class="text-sm font-medium">Feed URL</label>
						<input
							id="feed-url"
							name="feedUrl"
							type="url"
							placeholder="https://example.com/feed.rss"
							class="border-input bg-background ring-offset-background h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						/>
					</div>
					{#if form?.feedsMessage}
						<p class:text-destructive={!(form?.feedsSuccess ?? false)} class="text-sm">
							{form.feedsMessage}
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
							disabled={!(form?.feedsEtag ?? data.etag)}
						>
							Save first feed
						</button>
						<button
							type="button"
							class="text-muted-foreground text-sm hover:underline"
							onclick={dismissOnboarding}
						>
							Skip for now
						</button>
					</div>
				</form>
			</div>
		{:else}
			<Alert>
				<AlertTitle>First feed already saved</AlertTitle>
				<AlertDescription>
					Your feed is in place. The next onboarding tickets will add guided TV and movie target
					setup. You can continue later from this route or work directly in the
					<a href="/config" class="text-primary font-medium hover:underline">Config page</a>.
				</AlertDescription>
			</Alert>
		{/if}
	</section>
{/if}
