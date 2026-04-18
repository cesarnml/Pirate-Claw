<script lang="ts">
	import {
		candidatePosterUrl,
		candidateTitle,
		formatEta,
		formatSpeed,
		getTorrentDisplayStatus,
		initialBox
	} from '$lib/helpers';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import type { CandidateStateRecord, SessionInfo, TorrentStatSnapshot } from '$lib/types';

	type ActiveDownload = {
		torrent: TorrentStatSnapshot;
		candidate: CandidateStateRecord | null;
	};

	const {
		activeDownloads,
		transmissionSession
	}: {
		activeDownloads: ActiveDownload[];
		transmissionSession: SessionInfo | null;
	} = $props();

	// Derive speeds from individual torrents — consistent with per-card values and avoids
	// the session-stats / torrent-get snapshot skew.
	const totalDownloadSpeed = $derived(
		activeDownloads.reduce((sum, { torrent }) => sum + torrent.rateDownload, 0)
	);
	const totalUploadSpeed = $derived(
		activeDownloads.reduce((sum, { torrent }) => sum + torrent.rateUpload, 0)
	);
</script>

<Card class="bg-card/70 max-h-136 min-w-105 rounded-[30px] border-white/10">
	<CardHeader class="pb-4">
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
					Transmission activity
				</p>
				<h2 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">Torrent Manager</h2>
			</div>
			{#if transmissionSession}
				<div class="text-right">
					<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
						Live throughput
					</p>
					<p class="mt-2 flex flex-col items-end gap-0.5 text-sm font-medium">
						<span
							><span class="text-muted-foreground">↓</span>
							{formatSpeed(totalDownloadSpeed)}</span
						>
						<span
							><span class="text-muted-foreground">↑</span>
							{formatSpeed(totalUploadSpeed)}</span
						>
					</p>
				</div>
			{/if}
		</div>
	</CardHeader>
	<CardContent class="thin-scroll space-y-4 overflow-y-auto">
		{#if activeDownloads.length === 0}
			<div class="border-border bg-background/55 rounded-3xl border border-dashed px-5 py-8">
				<p class="text-sm font-medium">No active downloads right now.</p>
				<p class="text-muted-foreground mt-2 text-sm">
					Queued torrents will surface here once Transmission starts pulling them down.
				</p>
			</div>
		{:else}
			<ul class="space-y-4">
				{#each activeDownloads as { torrent, candidate }}
					{@const title = candidate ? candidateTitle(candidate) : torrent.name}
					{@const posterUrl = candidate ? candidatePosterUrl(candidate) : null}
					<li class="border-border bg-background/45 flex gap-4 rounded-[26px] border p-4">
						{#if posterUrl}
							<img
								src={posterUrl}
								alt={title}
								class="h-24 w-16 shrink-0 rounded-2xl object-cover"
								loading="lazy"
							/>
						{:else}
							<div
								class="bg-muted text-muted-foreground flex h-24 w-16 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold"
							>
								{initialBox(title)}
							</div>
						{/if}

						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-lg font-medium">{title}</p>
									<div class="text-muted-foreground mt-2 flex flex-wrap gap-2 text-xs">
										{#if candidate?.resolution}
											<span class="rounded-full bg-white/6 px-2 py-1">{candidate.resolution}</span>
										{/if}
										{#if candidate?.codec}
											<span class="rounded-full bg-white/6 px-2 py-1">{candidate.codec}</span>
										{/if}
										<StatusChip status={getTorrentDisplayStatus(torrent)} />
									</div>
								</div>
								<div class="text-right text-sm">
									<p class="font-medium">
										<span class="text-muted-foreground">↓</span>
										{formatSpeed(torrent.rateDownload)}
									</p>
									<p class="text-muted-foreground mt-1">{formatEta(torrent.eta)}</p>
								</div>
							</div>
							{#if torrent.percentDone !== 1}
								<div class="mt-4">
									<div class="mb-2 flex items-center justify-end text-xs">
										<p class="font-medium">{(torrent.percentDone * 100).toFixed(0)}%</p>
									</div>
									<div class="bg-muted h-2 rounded-full">
										<div
											class="bg-primary h-2 rounded-full"
											style="width: {(torrent.percentDone * 100).toFixed(0)}%"
										></div>
									</div>
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</CardContent>
</Card>
