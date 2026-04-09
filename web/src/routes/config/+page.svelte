<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();
</script>

<h1 class="text-3xl font-bold tracking-tight">Config</h1>
<p class="mt-1 text-sm text-muted-foreground">Read-only effective configuration from the API (secrets redacted).</p>

{#if data.error}
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.config}
	{@const config = data.config}

	<div class="mt-8 max-h-[calc(100vh-12rem)] space-y-6 overflow-y-auto pr-1">
		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">Feeds</h2>
			</CardHeader>
			<CardContent class="pt-0">
				{#if config.feeds.length === 0}
					<p class="text-sm text-muted-foreground">No feeds configured.</p>
				{:else}
					<ul class="list-none space-y-3">
						{#each config.feeds as feed}
							<li class="rounded-md border border-border bg-card/50 p-3 text-sm">
								<div class="font-medium text-foreground">{feed.name}</div>
								<div class="mt-1 text-muted-foreground">
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
					<p class="text-sm text-muted-foreground">No TV rules configured.</p>
				{:else}
					<ul class="list-none space-y-3">
						{#each config.tv as rule}
							<li class="rounded-md border border-border bg-card/50 p-3 text-sm">
								<div class="font-medium text-foreground">{rule.name}</div>
								<div class="mt-1 text-muted-foreground">
									{#if rule.matchPattern}
										<div>
											Pattern: <code class="rounded bg-muted px-1 font-mono text-foreground">{rule.matchPattern}</code>
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
				<dl class="grid gap-2 text-sm">
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Run interval:</dt>
						<dd class="text-foreground">{config.runtime.runIntervalMinutes}m</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Reconcile interval:</dt>
						<dd class="text-foreground">{config.runtime.reconcileIntervalMinutes}m</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Artifact dir:</dt>
						<dd class="text-foreground">{config.runtime.artifactDir}</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Artifact retention:</dt>
						<dd class="text-foreground">{config.runtime.artifactRetentionDays} days</dd>
					</div>
					{#if config.runtime.apiPort !== undefined}
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">API port:</dt>
							<dd class="text-foreground">{config.runtime.apiPort}</dd>
						</div>
					{/if}
				</dl>
			</CardContent>
		</Card>
	</div>
{/if}
