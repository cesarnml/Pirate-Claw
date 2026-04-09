<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import type { ActionData, PageData } from './$types';

	const { data, form }: { data: PageData; form?: ActionData } = $props();
	const currentEtag = $derived(form?.etag ?? data.etag ?? null);
</script>

<h1 class="text-3xl font-bold tracking-tight">Config</h1>
<p class="text-muted-foreground mt-1 text-sm">
	Effective configuration from the API (secrets redacted). Runtime fields can be edited and saved.
</p>

{#if data.error}
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.config}
	{@const config = data.config}

	<div class="mt-8 space-y-6 pr-1">
		{#if form?.message}
			<Alert variant={form?.success ? 'default' : 'destructive'}>
				<AlertTitle>{form?.success ? 'Save complete' : 'Save failed'}</AlertTitle>
				<AlertDescription>{form.message}</AlertDescription>
			</Alert>
		{/if}

		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">Feeds</h2>
			</CardHeader>
			<CardContent class="pt-0">
				{#if config.feeds.length === 0}
					<p class="text-muted-foreground text-sm">No feeds configured.</p>
				{:else}
					<ul class="list-none space-y-3">
						{#each config.feeds as feed}
							<li class="border-border bg-card/50 rounded-md border p-3 text-sm">
								<div class="text-foreground font-medium">{feed.name}</div>
								<div class="text-muted-foreground mt-1">
									<span class="mr-3">Type: {feed.mediaType}</span>
									{#if feed.pollIntervalMinutes !== undefined}
										<span class="mr-3">Poll: {feed.pollIntervalMinutes}m</span>
									{/if}
									<span class="break-all">URL: {feed.url}</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">TV Rules</h2>
			</CardHeader>
			<CardContent class="pt-0">
				{#if config.tv.length === 0}
					<p class="text-muted-foreground text-sm">No TV rules configured.</p>
				{:else}
					<ul class="list-none space-y-3">
						{#each config.tv as rule}
							<li class="border-border bg-card/50 rounded-md border p-3 text-sm">
								<div class="text-foreground font-medium">{rule.name}</div>
								<div class="text-muted-foreground mt-1">
									{#if rule.matchPattern}
										<div>
											Pattern: <code class="bg-muted text-foreground rounded px-1 font-mono"
												>{rule.matchPattern}</code
											>
										</div>
									{/if}
									<div>Resolutions: {rule.resolutions.join(', ')}</div>
									<div>Codecs: {rule.codecs.join(', ')}</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">Movies</h2>
			</CardHeader>
			<CardContent class="pt-0">
				<dl class="grid gap-2 text-sm">
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Years:</dt>
						<dd class="text-foreground">{config.movies.years.join(', ')}</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Resolutions:</dt>
						<dd class="text-foreground">{config.movies.resolutions.join(', ')}</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Codecs:</dt>
						<dd class="text-foreground">{config.movies.codecs.join(', ')}</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Codec policy:</dt>
						<dd class="text-foreground">{config.movies.codecPolicy}</dd>
					</div>
				</dl>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">Transmission</h2>
			</CardHeader>
			<CardContent class="pt-0">
				<dl class="grid gap-2 text-sm">
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">URL:</dt>
						<dd class="text-foreground">{config.transmission.url}</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Username:</dt>
						<dd class="text-foreground">{config.transmission.username}</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Password:</dt>
						<dd class="text-foreground">••••••••</dd>
					</div>
					{#if config.transmission.downloadDir}
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Download dir:</dt>
							<dd class="text-foreground">{config.transmission.downloadDir}</dd>
						</div>
					{/if}
					{#if config.transmission.downloadDirs}
						{#if config.transmission.downloadDirs.tv}
							<div class="flex flex-wrap gap-2">
								<dt class="text-muted-foreground">TV dir:</dt>
								<dd class="text-foreground">{config.transmission.downloadDirs.tv}</dd>
							</div>
						{/if}
						{#if config.transmission.downloadDirs.movie}
							<div class="flex flex-wrap gap-2">
								<dt class="text-muted-foreground">Movie dir:</dt>
								<dd class="text-foreground">{config.transmission.downloadDirs.movie}</dd>
							</div>
						{/if}
					{/if}
				</dl>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">Runtime</h2>
			</CardHeader>
			<CardContent class="pt-0">
				<form method="POST" action="?/saveRuntime" use:enhance class="grid gap-4 text-sm">
					<input type="hidden" name="ifMatch" value={currentEtag ?? ''} />

					<div class="grid gap-1">
						<label class="text-muted-foreground" for="runIntervalMinutes"
							>Run interval (minutes)</label
						>
						<input
							id="runIntervalMinutes"
							name="runIntervalMinutes"
							type="number"
							min="1"
							step="1"
							value={config.runtime.runIntervalMinutes}
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						/>
					</div>

					<div class="grid gap-1">
						<label class="text-muted-foreground" for="reconcileIntervalMinutes">
							Reconcile interval (minutes)
						</label>
						<input
							id="reconcileIntervalMinutes"
							name="reconcileIntervalMinutes"
							type="number"
							min="1"
							step="1"
							value={config.runtime.reconcileIntervalMinutes}
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						/>
					</div>

					<div class="grid gap-1">
						<label class="text-muted-foreground" for="tmdbRefreshIntervalMinutes">
							TMDB refresh interval (minutes, 0 disables)
						</label>
						<input
							id="tmdbRefreshIntervalMinutes"
							name="tmdbRefreshIntervalMinutes"
							type="number"
							min="0"
							step="1"
							value={config.runtime.tmdbRefreshIntervalMinutes ?? 0}
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						/>
					</div>

					<div class="grid gap-1">
						<label class="text-muted-foreground" for="apiPort">API port (optional)</label>
						<input
							id="apiPort"
							name="apiPort"
							type="number"
							min="1"
							max="65535"
							step="1"
							value={config.runtime.apiPort ?? ''}
							placeholder="unset"
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						/>
					</div>

					<div class="text-muted-foreground text-xs">
						Revision: <code>{currentEtag ?? 'missing'}</code>
					</div>
					<p class="text-muted-foreground text-xs">
						Saving writes config only. Restart the daemon process to apply new runtime intervals and
						port changes.
					</p>
					<div>
						<button
							type="submit"
							class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
							disabled={!currentEtag}
						>
							Save runtime settings
						</button>
					</div>
				</form>
			</CardContent>
		</Card>
	</div>
{/if}
