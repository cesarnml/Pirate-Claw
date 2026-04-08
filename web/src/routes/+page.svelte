<script lang="ts">
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	function formatUptime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'UTC',
		});
	}
</script>

<h1 class="text-2xl font-semibold">Dashboard</h1>

{#if data.error}
	<p class="mt-4 text-red-400" role="alert">{data.error}</p>
{:else if data.health}
	{@const health = data.health}
	{@const runs = data.runs}

	<section class="mt-6">
		<h2 class="text-lg font-semibold text-gray-200">Daemon</h2>
		<dl class="mt-2 rounded bg-gray-800 p-3 text-sm">
			<div class="flex gap-2">
				<dt class="text-gray-400">Uptime:</dt>
				<dd class="text-gray-200">{formatUptime(health.uptime)}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="text-gray-400">Started at:</dt>
				<dd class="text-gray-200">{formatDate(health.startedAt)}</dd>
			</div>
			{#if health.lastRunCycle}
				<div class="flex gap-2">
					<dt class="text-gray-400">Last run cycle:</dt>
					<dd class="text-gray-200">{formatDate(health.lastRunCycle.startedAt)}</dd>
				</div>
			{/if}
			{#if health.lastReconcileCycle}
				<div class="flex gap-2">
					<dt class="text-gray-400">Last reconcile:</dt>
					<dd class="text-gray-200">{formatDate(health.lastReconcileCycle.startedAt)}</dd>
				</div>
			{/if}
		</dl>
	</section>

	<section class="mt-6">
		<h2 class="text-lg font-semibold text-gray-200">Recent Runs</h2>
		{#if runs.length === 0}
			<p class="mt-2 text-gray-400">No runs recorded yet.</p>
		{:else}
			<table class="mt-2 w-full text-left text-sm">
				<thead>
					<tr class="border-b border-gray-700 text-gray-400">
						<th class="py-2 pr-4">ID</th>
						<th class="py-2 pr-4">Started</th>
						<th class="py-2 pr-4">Status</th>
						<th class="py-2 pr-4">Queued</th>
						<th class="py-2 pr-4">Failed</th>
						<th class="py-2 pr-4">Skipped</th>
					</tr>
				</thead>
				<tbody>
					{#each runs as run}
						<tr class="border-b border-gray-800 text-gray-300">
							<td class="py-2 pr-4 font-mono">{run.id}</td>
							<td class="py-2 pr-4">{formatDate(run.startedAt)}</td>
							<td class="py-2 pr-4">{run.status}</td>
							<td class="py-2 pr-4">{run.counts.queued ?? 0}</td>
							<td class="py-2 pr-4">{run.counts.failed ?? 0}</td>
							<td class="py-2 pr-4"
								>{(run.counts.skipped_duplicate ?? 0) +
									(run.counts.skipped_no_match ?? 0)}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<nav class="mt-8 flex gap-4 text-sm">
		<a href="/candidates" class="text-blue-400 hover:underline">View Candidates</a>
		<a href="/config" class="text-blue-400 hover:underline">View Config</a>
	</nav>
{:else}
	<p class="mt-4 text-gray-400">Loading…</p>
{/if}

