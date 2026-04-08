<script lang="ts">
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();
</script>

<h1 class="text-2xl font-semibold">Config</h1>

{#if data.error}
	<p class="mt-4 text-red-400" role="alert">{data.error}</p>
{:else if data.config}
	{@const config = data.config}

	<section class="mt-6">
		<h2 class="text-lg font-semibold text-gray-200">Feeds</h2>
		{#if config.feeds.length === 0}
			<p class="mt-2 text-gray-400">No feeds configured.</p>
		{:else}
			<ul class="mt-2 space-y-3">
				{#each config.feeds as feed}
					<li class="rounded bg-gray-800 p-3 text-sm">
						<div class="font-medium text-gray-100">{feed.name}</div>
						<div class="mt-1 text-gray-400">
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
	</section>

	<section class="mt-6">
		<h2 class="text-lg font-semibold text-gray-200">TV Rules</h2>
		{#if config.tv.length === 0}
			<p class="mt-2 text-gray-400">No TV rules configured.</p>
		{:else}
			<ul class="mt-2 space-y-3">
				{#each config.tv as rule}
					<li class="rounded bg-gray-800 p-3 text-sm">
						<div class="font-medium text-gray-100">{rule.name}</div>
						<div class="mt-1 text-gray-400">
							{#if rule.matchPattern}
								<div>Pattern: <code class="text-gray-300">{rule.matchPattern}</code></div>
							{/if}
							<div>Resolutions: {rule.resolutions.join(', ')}</div>
							<div>Codecs: {rule.codecs.join(', ')}</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mt-6">
		<h2 class="text-lg font-semibold text-gray-200">Movies</h2>
		<dl class="mt-2 rounded bg-gray-800 p-3 text-sm">
			<div class="flex gap-2">
				<dt class="text-gray-400">Years:</dt>
				<dd class="text-gray-200">{config.movies.years.join(', ')}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Resolutions:</dt>
				<dd class="text-gray-200">{config.movies.resolutions.join(', ')}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Codecs:</dt>
				<dd class="text-gray-200">{config.movies.codecs.join(', ')}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Codec policy:</dt>
				<dd class="text-gray-200">{config.movies.codecPolicy}</dd>
			</div>
		</dl>
	</section>

	<section class="mt-6">
		<h2 class="text-lg font-semibold text-gray-200">Transmission</h2>
		<dl class="mt-2 rounded bg-gray-800 p-3 text-sm">
			<div class="flex gap-2">
				<dt class="text-gray-400">URL:</dt>
				<dd class="text-gray-200">{config.transmission.url}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Username:</dt>
				<dd class="text-gray-200">{config.transmission.username}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Password:</dt>
				<dd class="text-gray-200">{config.transmission.password}</dd>
			</div>
			{#if config.transmission.downloadDir}
				<div class="flex gap-2">
					<dt class="text-gray-400">Download dir:</dt>
					<dd class="text-gray-200">{config.transmission.downloadDir}</dd>
				</div>
			{/if}
			{#if config.transmission.downloadDirs}
				{#if config.transmission.downloadDirs.tv}
					<div class="flex gap-2">
						<dt class="text-gray-400">TV dir:</dt>
						<dd class="text-gray-200">{config.transmission.downloadDirs.tv}</dd>
					</div>
				{/if}
				{#if config.transmission.downloadDirs.movie}
					<div class="flex gap-2">
						<dt class="text-gray-400">Movie dir:</dt>
						<dd class="text-gray-200">{config.transmission.downloadDirs.movie}</dd>
					</div>
				{/if}
			{/if}
		</dl>
	</section>

	<section class="mt-6">
		<h2 class="text-lg font-semibold text-gray-200">Runtime</h2>
		<dl class="mt-2 rounded bg-gray-800 p-3 text-sm">
			<div class="flex gap-2">
				<dt class="text-gray-400">Run interval:</dt>
				<dd class="text-gray-200">{config.runtime.runIntervalMinutes}m</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Reconcile interval:</dt>
				<dd class="text-gray-200">{config.runtime.reconcileIntervalMinutes}m</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Artifact dir:</dt>
				<dd class="text-gray-200">{config.runtime.artifactDir}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Artifact retention:</dt>
				<dd class="text-gray-200">{config.runtime.artifactRetentionDays} days</dd>
			</div>
			{#if config.runtime.apiPort !== undefined}
				<div class="flex gap-2">
					<dt class="text-gray-400">API port:</dt>
					<dd class="text-gray-200">{config.runtime.apiPort}</dd>
				</div>
			{/if}
		</dl>
	</section>
{/if}

