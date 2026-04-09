<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
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

<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>

{#if data.error}
	<Alert variant="destructive" class="mt-6">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.health}
	{@const health = data.health}
	{@const runs = data.runs}

	<section class="mt-8 space-y-6">
		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">Daemon</h2>
			</CardHeader>
			<CardContent>
				<dl class="grid gap-3 text-sm">
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Uptime</dt>
						<dd class="font-medium">{formatUptime(health.uptime)}</dd>
					</div>
					<div class="flex flex-wrap gap-2">
						<dt class="text-muted-foreground">Started at</dt>
						<dd class="font-medium">{formatDate(health.startedAt)}</dd>
					</div>
					{#if health.lastRunCycle}
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Last run cycle</dt>
							<dd class="font-medium">{formatDate(health.lastRunCycle.startedAt)}</dd>
						</div>
					{/if}
					{#if health.lastReconcileCycle}
						<div class="flex flex-wrap gap-2">
							<dt class="text-muted-foreground">Last reconcile</dt>
							<dd class="font-medium">{formatDate(health.lastReconcileCycle.startedAt)}</dd>
						</div>
					{/if}
				</dl>
			</CardContent>
		</Card>

		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">Recent Runs</h2>
			</CardHeader>
			<CardContent>
				{#if runs.length === 0}
					<p class="text-sm text-muted-foreground">No runs recorded yet.</p>
				{:else}
					<div class="rounded-md border border-border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>ID</TableHead>
									<TableHead>Started</TableHead>
									<TableHead>Status</TableHead>
									<TableHead class="text-right">Queued</TableHead>
									<TableHead class="text-right">Failed</TableHead>
									<TableHead class="text-right">Skipped</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each runs as run}
									<TableRow>
										<TableCell class="font-mono text-xs">{run.id}</TableCell>
										<TableCell>{formatDate(run.startedAt)}</TableCell>
										<TableCell>{run.status}</TableCell>
										<TableCell class="text-right">{run.counts.queued ?? 0}</TableCell>
										<TableCell class="text-right">{run.counts.failed ?? 0}</TableCell>
										<TableCell class="text-right"
											>{(run.counts.skipped_duplicate ?? 0) +
												(run.counts.skipped_no_match ?? 0)}</TableCell
										>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</CardContent>
		</Card>
	</section>
	
{:else}
	<!-- Defensive: load currently returns either health or error, not both null -->
	<p class="mt-6 text-sm text-muted-foreground">Loading…</p>
{/if}
