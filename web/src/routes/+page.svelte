<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import type { CandidateStateRecord, CandidateStatus } from '$lib/types';
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
			timeZone: 'UTC'
		});
	}

	function formatShortDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	function formatSpeed(bytesPerSec: number): string {
		if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`;
		return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
	}

	function formatEta(eta: number): string {
		if (eta < 0) return '—';
		if (eta < 60) return '<1m';
		const hours = Math.floor(eta / 3600);
		const minutes = Math.floor((eta % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function statusBadgeClass(status: CandidateStatus): string {
		switch (status) {
			case 'queued':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'completed':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'failed':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
			case 'duplicate':
			case 'skipped':
				return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
			case 'downloading':
				return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
			default:
				return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
		}
	}

	function initialBox(title: string): string {
		return title.charAt(0).toUpperCase();
	}

	const candidates = $derived(data.candidates ?? []);
	const torrents = $derived(data.transmissionTorrents ?? []);

	const activeDownloads = $derived(
		torrents
			.filter((t) => t.status === 'downloading')
			.slice(0, 5)
			.map((t) => {
				const candidate = candidates.find((c) => c.transmissionTorrentHash === t.hash);
				return { torrent: t, candidate };
			})
	);

	const recentCandidates = $derived(
		[...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10)
	);

	const totalTracked = $derived(candidates.length);
	const failedCount = $derived(candidates.filter((c) => c.status === 'failed').length);

	const oneWeekAgo = $derived(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
	const completedThisWeek = $derived(
		candidates.filter((c) => {
			if (c.status !== 'completed' || !c.transmissionDoneDate) return false;
			return new Date(c.transmissionDoneDate) >= oneWeekAgo;
		}).length
	);

	const archiveItems = $derived(
		candidates
			.filter(
				(c): c is CandidateStateRecord & { transmissionDoneDate: string } =>
					c.status === 'completed' && !!c.transmissionDoneDate
			)
			.sort((a, b) => b.transmissionDoneDate.localeCompare(a.transmissionDoneDate))
			.slice(0, 6)
	);
</script>

<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>

{#if data.error}
	<Alert variant="destructive" class="mt-6" role="alert">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if data.health}
	{@const health = data.health}
	{@const session = data.transmissionSession}

	<section class="mt-8 space-y-6">
		<!-- Header strip -->
		<div class="grid gap-4 sm:grid-cols-2">
			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">Daemon</h2>
				</CardHeader>
				<CardContent>
					<dl class="grid gap-2 text-sm">
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
								<dt class="text-muted-foreground">Last run</dt>
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
					<h2 class="text-lg font-semibold tracking-tight">Transmission</h2>
				</CardHeader>
				<CardContent>
					{#if session}
						<dl class="grid gap-2 text-sm">
							<div class="flex flex-wrap gap-2">
								<dt class="text-muted-foreground">Version</dt>
								<dd class="font-medium">{session.version}</dd>
							</div>
							<div class="flex flex-wrap gap-2">
								<dt class="text-muted-foreground">Download</dt>
								<dd class="font-medium">{formatSpeed(session.downloadSpeed)}</dd>
							</div>
							<div class="flex flex-wrap gap-2">
								<dt class="text-muted-foreground">Upload</dt>
								<dd class="font-medium">{formatSpeed(session.uploadSpeed)}</dd>
							</div>
							<div class="flex flex-wrap gap-2">
								<dt class="text-muted-foreground">Active torrents</dt>
								<dd class="font-medium">{session.activeTorrentCount}</dd>
							</div>
						</dl>
					{:else}
						<p class="text-muted-foreground text-sm">Transmission unavailable</p>
					{/if}
				</CardContent>
			</Card>
		</div>

		<!-- Stats row -->
		<div class="grid grid-cols-3 gap-4">
			<Card>
				<CardContent class="pt-6">
					<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Total tracked
					</p>
					<p class="mt-1 text-3xl font-bold">{totalTracked}</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="pt-6">
					<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Completed this week
					</p>
					<p class="mt-1 text-3xl font-bold">{completedThisWeek}</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="pt-6">
					<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Failed</p>
					<p class="mt-1 text-3xl font-bold">{failedCount}</p>
				</CardContent>
			</Card>
		</div>

		<!-- Active Downloads -->
		{#if activeDownloads.length > 0}
			<Card>
				<CardHeader class="pb-3">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold tracking-tight">Active Downloads</h2>
						<a href="/candidates" class="text-primary text-sm hover:underline">View all</a>
					</div>
				</CardHeader>
				<CardContent>
					<ul class="space-y-4">
						{#each activeDownloads as { torrent, candidate }}
							{@const title = candidate?.normalizedTitle ?? torrent.name}
							{@const posterUrl =
								candidate?.tmdb && 'posterUrl' in candidate.tmdb ? candidate.tmdb.posterUrl : null}
							<li class="flex items-center gap-3">
								<!-- Poster / initial box -->
								{#if posterUrl}
									<img src={posterUrl} alt={title} class="h-12 w-8 shrink-0 rounded object-cover" />
								{:else}
									<div
										class="bg-muted text-muted-foreground flex h-12 w-8 shrink-0 items-center justify-center rounded text-sm font-bold"
									>
										{initialBox(title)}
									</div>
								{/if}
								<!-- Info -->
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{title}</p>
									<div class="mt-1 flex items-center gap-3 text-xs">
										<div class="bg-muted h-1.5 flex-1 rounded-full">
											<div
												class="bg-primary h-1.5 rounded-full"
												style="width: {(torrent.percentDone * 100).toFixed(0)}%"
											></div>
										</div>
										<span class="text-muted-foreground shrink-0"
											>{(torrent.percentDone * 100).toFixed(0)}%</span
										>
									</div>
								</div>
								<!-- Speed + ETA -->
								<div class="text-muted-foreground shrink-0 text-right text-xs">
									<p>{formatSpeed(torrent.rateDownload)}</p>
									<p>{formatEta(torrent.eta)}</p>
								</div>
							</li>
						{/each}
					</ul>
				</CardContent>
			</Card>
		{/if}

		<!-- Event Log -->
		<Card>
			<CardHeader class="pb-3">
				<h2 class="text-lg font-semibold tracking-tight">Event Log</h2>
			</CardHeader>
			<CardContent>
				{#if recentCandidates.length === 0}
					<p class="text-muted-foreground text-sm">No candidates yet.</p>
				{:else}
					<div class="border-border rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Title</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Updated</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each recentCandidates as c}
									<TableRow>
										<TableCell class="max-w-xs truncate text-sm font-medium"
											>{c.normalizedTitle}</TableCell
										>
										<TableCell>
											<span
												class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {statusBadgeClass(
													c.status
												)}"
											>
												{c.status}
											</span>
										</TableCell>
										<TableCell class="text-muted-foreground text-xs"
											>{formatDate(c.updatedAt)}</TableCell
										>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</CardContent>
		</Card>

		<!-- Archive Commit grid -->
		{#if archiveItems.length > 0}
			<section data-testid="archive-grid">
				<h2 class="mb-4 text-lg font-semibold tracking-tight">Recently Completed</h2>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
					{#each archiveItems as item}
						{@const posterUrl = item.tmdb && 'posterUrl' in item.tmdb ? item.tmdb.posterUrl : null}
						<div class="flex flex-col gap-2">
							{#if posterUrl}
								<img
									src={posterUrl}
									alt={item.normalizedTitle}
									class="aspect-[2/3] w-full rounded object-cover"
								/>
							{:else}
								<div
									class="bg-muted text-muted-foreground flex aspect-[2/3] w-full items-center justify-center rounded text-xs"
								>
									No poster
								</div>
							{/if}
							<div>
								<p class="truncate text-xs font-medium">{item.normalizedTitle}</p>
								<p class="text-muted-foreground text-xs">
									{formatShortDate(item.transmissionDoneDate)}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</section>
{:else}
	<!-- Defensive: load currently returns either health or error, not both null -->
	<p class="text-muted-foreground mt-6 text-sm">Loading…</p>
{/if}
