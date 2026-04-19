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
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	type ActiveDownload = {
		torrent: TorrentStatSnapshot;
		candidate: CandidateStateRecord | null;
	};

	type MenuAction = 'pause' | 'resume' | 'remove' | 'removeAndDelete';
	type MenuItem = { label: string; action: MenuAction; destructive?: boolean };
	type MenuState = { hash: string; x: number; y: number; items: MenuItem[] };

	const {
		activeDownloads,
		missingCandidates,
		transmissionSession
	}: {
		activeDownloads: ActiveDownload[];
		missingCandidates: CandidateStateRecord[];
		transmissionSession: SessionInfo | null;
	} = $props();

	let inflightDispose = $state<string | null>(null);
	let disposeErrors = $state<Record<string, string>>({});

	let menuState = $state<MenuState | null>(null);
	let inflightAction = $state<string | null>(null);
	let actionErrors = $state<Record<string, string>>({});

	function enhanceDispose(hash: string) {
		return () => {
			inflightDispose = hash;
			delete disposeErrors[hash];
			return async ({
				result,
				update
			}: {
				result: { type: string; data?: unknown };
				update: () => Promise<void>;
			}) => {
				inflightDispose = null;
				if (result.type === 'failure') {
					const data = result.data as { error?: string } | undefined;
					disposeErrors[hash] = data?.error ?? 'Failed';
				} else {
					await update();
				}
			};
		};
	}

	function rowDisplayState(
		torrent: TorrentStatSnapshot,
		candidate: CandidateStateRecord | null
	): 'downloading' | 'paused' | 'completed' | 'removed' | 'deleted' {
		if (candidate?.pirateClawDisposition) return candidate.pirateClawDisposition;
		if (torrent.percentDone === 1) return 'completed';
		if (torrent.status === 'stopped') return 'paused';
		return 'downloading';
	}

	function menuItemsForState(state: ReturnType<typeof rowDisplayState>): MenuItem[] {
		const destructiveItems: MenuItem[] = [
			{ label: 'Remove', action: 'remove', destructive: true },
			{ label: 'Remove + Delete Data', action: 'removeAndDelete', destructive: true }
		];
		if (state === 'downloading') return [{ label: 'Pause', action: 'pause' }, ...destructiveItems];
		if (state === 'paused') return [{ label: 'Resume', action: 'resume' }, ...destructiveItems];
		if (state === 'completed') return destructiveItems;
		return [];
	}

	function openMenu(
		event: MouseEvent,
		hash: string,
		torrent: TorrentStatSnapshot,
		candidate: CandidateStateRecord | null
	) {
		event.preventDefault();
		const items = menuItemsForState(rowDisplayState(torrent, candidate));
		if (items.length === 0) return;
		menuState = { hash, x: event.clientX, y: event.clientY, items };
	}

	function closeMenu() {
		menuState = null;
	}

	async function executeAction(action: MenuAction, hash: string) {
		if (inflightAction) return;
		if (
			action === 'removeAndDelete' &&
			!confirm('Remove this torrent and delete its downloaded data? This cannot be undone.')
		) {
			return;
		}
		menuState = null;
		inflightAction = hash;
		delete actionErrors[hash];
		const formData = new FormData();
		formData.append('hash', hash);
		try {
			const res = await fetch(`?/${action}`, { method: 'POST', body: formData });
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				await invalidateAll();
			} else if (result.type === 'failure') {
				const data = result.data as { error?: string } | undefined;
				actionErrors[hash] = data?.error ?? 'Request failed';
			} else {
				actionErrors[hash] = 'Request failed';
			}
		} catch {
			actionErrors[hash] = 'Network error';
		} finally {
			if (inflightAction === hash) inflightAction = null;
		}
	}

	$effect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') closeMenu();
		}
		function onPointerDown(e: PointerEvent) {
			if (menuState && !(e.target as Element).closest('[data-context-menu]')) closeMenu();
		}
		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('pointerdown', onPointerDown);
		return () => {
			document.removeEventListener('keydown', onKeyDown);
			document.removeEventListener('pointerdown', onPointerDown);
		};
	});

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
						<span>
							<span class="text-accent">↓</span>
							<span class="text-accent">
								{formatSpeed(totalDownloadSpeed)}
							</span>
						</span>
						<span>
							<span class="text-destructive">↑</span>
							<span class="text-destructive">{formatSpeed(totalUploadSpeed)}</span>
						</span>
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
					{@const inFlightRow = inflightAction === torrent.hash}
					{@const rowError = actionErrors[torrent.hash]}
					<li
						class="border-border bg-background/45 flex gap-4 rounded-[26px] border p-4"
						class:opacity-60={inFlightRow}
						class:cursor-wait={inFlightRow}
						oncontextmenu={(e) => !inFlightRow && openMenu(e, torrent.hash, torrent, candidate)}
					>
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
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-lg font-medium">{title}</p>
								</div>
								<div class="text-right text-sm">
									<p class="font-medium">
										<span class="text-muted-foreground">↓</span>
										{formatSpeed(torrent.rateDownload)}
									</p>
									<p class="text-muted-foreground mt-1">{formatEta(torrent.eta)}</p>
								</div>
							</div>
							<div class="text-muted-foreground mt-2 flex flex-wrap gap-2 text-xs">
								{#if candidate?.resolution}
									<span class="rounded-full bg-white/6 px-2 py-1">{candidate.resolution}</span>
								{/if}
								{#if candidate?.codec}
									<span class="rounded-full bg-white/6 px-2 py-1">{candidate.codec}</span>
								{/if}
								<StatusChip status={getTorrentDisplayStatus(torrent)} />
							</div>
							{#if torrent.percentDone !== 1}
								<div class="mt-4">
									<div class="text-primary/80 mb-2 flex items-center justify-end text-xs">
										<p class="font-medium">{(torrent.percentDone * 100).toFixed(0)}%</p>
									</div>
									<div class="bg-primary/20 h-2 rounded-full">
										<div
											class="bg-primary h-2 rounded-full"
											style="width: {(torrent.percentDone * 100).toFixed(0)}%"
										></div>
									</div>
								</div>
							{/if}
							{#if rowError}
								<p class="text-destructive mt-2 text-xs">{rowError}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		{#if missingCandidates.length > 0}
			<div class="border-border border-t pt-4">
				<p class="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.24em] uppercase">
					Missing from Transmission
				</p>
				<ul class="space-y-3">
					{#each missingCandidates as candidate (candidate.identityKey)}
						{@const title = candidateTitle(candidate)}
						{@const hash = candidate.transmissionTorrentHash!}
						{@const inFlight = inflightDispose === hash}
						{@const rowError = disposeErrors[hash]}
						<li
							class="border-border bg-background/45 flex items-center justify-between gap-3 rounded-[20px] border p-3"
						>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium">{title}</p>
								{#if rowError}
									<p class="text-destructive mt-1 text-xs">{rowError}</p>
								{/if}
							</div>
							<div class="flex shrink-0 gap-2">
								<form method="POST" action="?/dispose" use:enhance={enhanceDispose(hash)}>
									<input type="hidden" name="hash" value={hash} />
									<input type="hidden" name="disposition" value="removed" />
									<button
										type="submit"
										disabled={inFlight}
										class="text-muted-foreground hover:text-foreground rounded-lg bg-white/6 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
									>
										Mark Removed
									</button>
								</form>
								<form method="POST" action="?/dispose" use:enhance={enhanceDispose(hash)}>
									<input type="hidden" name="hash" value={hash} />
									<input type="hidden" name="disposition" value="deleted" />
									<button
										type="submit"
										disabled={inFlight}
										class="text-destructive/80 hover:text-destructive rounded-lg bg-white/6 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
									>
										Mark Deleted
									</button>
								</form>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</CardContent>
</Card>

{#if menuState}
	<ul
		data-context-menu
		role="menu"
		class="bg-popover border-border fixed z-50 min-w-44 rounded-xl border py-1 text-sm shadow-lg"
		style="left: {menuState.x}px; top: {menuState.y}px;"
	>
		{#each menuState.items as item}
			<li role="none">
				<button
					role="menuitem"
					class="hover:bg-accent w-full px-3 py-2 text-left transition-colors"
					class:text-destructive={item.destructive}
					onclick={() => executeAction(item.action, menuState!.hash)}
				>
					{item.label}
				</button>
			</li>
		{/each}
	</ul>
{/if}
