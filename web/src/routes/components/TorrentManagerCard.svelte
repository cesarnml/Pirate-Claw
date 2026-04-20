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
	import type { CandidateStateRecord, TorrentStatSnapshot } from '$lib/types';
	import { deserialize, enhance } from '$app/forms';
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';

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
		transmissionLoaded
	}: {
		activeDownloads: ActiveDownload[];
		missingCandidates: CandidateStateRecord[];
		transmissionLoaded: boolean;
	} = $props();

	let inflightDispose = $state<string | null>(null);

	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressTouchOrigin = { x: 0, y: 0 };

	function onTouchStart(
		e: TouchEvent,
		hash: string,
		torrent: TorrentStatSnapshot,
		candidate: CandidateStateRecord | null
	) {
		const t = e.touches[0];
		longPressTouchOrigin = { x: t.clientX, y: t.clientY };
		longPressTimer = setTimeout(() => {
			longPressTimer = null;
			openMenu({ clientX: t.clientX, clientY: t.clientY } as MouseEvent, hash, torrent, candidate);
		}, 500);
	}

	function cancelLongPress() {
		if (longPressTimer !== null) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (longPressTimer === null) return;
		const t = e.touches[0];
		if (
			Math.abs(t.clientX - longPressTouchOrigin.x) > 8 ||
			Math.abs(t.clientY - longPressTouchOrigin.y) > 8
		)
			cancelLongPress();
	}

	let menuState = $state<MenuState | null>(null);
	let inflightAction = $state<string | null>(null);

	const disposeLabels: Record<string, string> = {
		removed: 'Marked as removed',
		deleted: 'Marked as deleted'
	};

	function enhanceDispose(hash: string, disposition: string) {
		return () => {
			inflightDispose = hash;
			return async ({
				result,
				update
			}: {
				result: { type: string; data?: unknown };
				update: () => Promise<void>;
			}) => {
				inflightDispose = null;
				if (result.type === 'failure' || result.type === 'error') {
					toast('Action failed', 'error');
				} else {
					toast(disposeLabels[disposition] ?? 'Done', 'success');
					await update();
				}
			};
		};
	}

	function rowDisplayState(
		torrent: TorrentStatSnapshot,
		candidate: CandidateStateRecord | null
	): 'downloading' | 'seeding' | 'paused' | 'completed' | 'removed' | 'deleted' {
		if (candidate?.pirateClawDisposition) return candidate.pirateClawDisposition;
		if (torrent.status === 'seeding') return 'seeding';
		if (torrent.percentDone === 1) return 'completed';
		if (torrent.status === 'stopped') return 'paused';
		return 'downloading';
	}

	function menuItemsForState(state: ReturnType<typeof rowDisplayState>): MenuItem[] {
		const destructiveItems: MenuItem[] = [
			{ label: 'Remove', action: 'remove', destructive: true },
			{ label: 'Remove + Delete Data', action: 'removeAndDelete', destructive: true }
		];
		if (state === 'downloading' || state === 'seeding')
			return [{ label: 'Pause', action: 'pause' }, ...destructiveItems];
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

	const actionToasts: Record<MenuAction, string> = {
		pause: 'Paused',
		resume: 'Resumed',
		remove: 'Torrent removed',
		removeAndDelete: 'Torrent removed and data deleted'
	};

	async function executeAction(action: MenuAction, hash: string) {
		if (inflightAction) return;
		menuState = null;
		inflightAction = hash;
		const formData = new FormData();
		formData.append('hash', hash);
		const actionHref = `${base}/?/${action}`;
		try {
			const res = await fetch(actionHref, {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'x-sveltekit-action': 'true'
				},
				body: formData,
				cache: 'no-store'
			});

			const result = deserialize(await res.text());

			if (result.type === 'error' || result.type === 'failure') {
				toast('Action failed', 'error');
				return;
			}
			if (result.type === 'redirect') {
				return;
			}

			toast(actionToasts[action], 'success');
			// Refresh load data; avoid applyAction(result) so a stale serialized snapshot cannot
			// overwrite a newer invalidate (e.g. pause right after requeue finishes invalidating).
			await invalidateAll();
			// Follow-up load: Transmission can lag one torrent-get behind stop/remove RPCs.
			if (action === 'pause' || action === 'remove' || action === 'removeAndDelete') {
				await new Promise((r) => setTimeout(r, 150));
				await invalidateAll();
			}
		} catch {
			toast('Action failed', 'error');
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

<Card class="bg-card/70 max-h-136 min-w-84 rounded-[30px] border-white/10">
	<CardHeader class="pb-4">
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
					Transmission activity
				</p>
				<h2 class="mt-2 text-2xl font-semibold tracking-[-0.03em]">Torrent Manager</h2>
			</div>
			{#if transmissionLoaded}
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
				{#each activeDownloads as { torrent, candidate } (torrent.hash)}
					{@const title = candidate ? candidateTitle(candidate) : torrent.name}
					{@const posterUrl = candidate ? candidatePosterUrl(candidate) : null}
					{@const inFlightRow = inflightAction === torrent.hash}
					{@const rowState = rowDisplayState(torrent, candidate)}
					{@const showUpload =
						rowState === 'completed' || rowState === 'seeding' || rowState === 'paused'}
					<li
						class="border-border bg-background/45 flex gap-4 rounded-[26px] border p-4"
						class:opacity-60={inFlightRow}
						class:cursor-wait={inFlightRow}
						oncontextmenu={(e) => !inFlightRow && openMenu(e, torrent.hash, torrent, candidate)}
						ontouchstart={(e) => !inFlightRow && onTouchStart(e, torrent.hash, torrent, candidate)}
						ontouchend={cancelLongPress}
						ontouchcancel={cancelLongPress}
						ontouchmove={onTouchMove}
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
								<div class="text-right text-xs">
									{#if showUpload}
										<p class="font-medium">
											<span class="text-amber-400">↑</span>
											<span class="text-amber-400">{formatSpeed(torrent.rateUpload)}</span>
										</p>
									{:else}
										<p class="font-medium">
											<span class="text-accent">↓</span>
											<span class="text-accent">{formatSpeed(torrent.rateDownload)}</span>
										</p>
										<p class="text-muted-foreground mt-1">{formatEta(torrent.eta)}</p>
									{/if}
								</div>
							</div>
							<div class="text-muted-foreground mt-2 flex flex-wrap gap-2 text-xs">
								{#if candidate?.mediaType}
									<span class="rounded-full bg-white/6 px-2 py-1 uppercase"
										>{candidate.mediaType}</span
									>
								{/if}
								{#if candidate?.mediaType === 'tv' && candidate?.season != null}
									<span class="rounded-full bg-white/6 px-2 py-1"
										>S{String(candidate.season).padStart(2, '0')}</span
									>
								{/if}
								{#if candidate?.mediaType === 'tv' && candidate?.episode != null}
									<span class="rounded-full bg-white/6 px-2 py-1"
										>E{String(candidate.episode).padStart(2, '0')}</span
									>
								{/if}
								{#if candidate?.resolution}
									<span class="rounded-full bg-white/6 px-2 py-1">{candidate.resolution}</span>
								{/if}
								{#if candidate?.codec}
									<span class="rounded-full bg-white/6 px-2 py-1">{candidate.codec}</span>
								{/if}
							</div>
							<div class="mt-1.5">
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
						<li
							class="border-border bg-background/45 flex items-center justify-between gap-3 rounded-[20px] border p-3"
						>
							<div class="mr-2 flex min-w-0 items-center gap-1.5 overflow-hidden">
								<p class="shrink truncate text-sm font-medium">{title}</p>
								{#if candidate.mediaType}
									<span
										class="text-muted-foreground shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[10px] uppercase"
										>{candidate.mediaType}</span
									>
								{/if}
								{#if candidate.mediaType === 'tv' && candidate.season != null}
									<span
										class="text-muted-foreground shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[10px]"
										>S{String(candidate.season).padStart(2, '0')}</span
									>
								{/if}
								{#if candidate.mediaType === 'tv' && candidate.episode != null}
									<span
										class="text-muted-foreground shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[10px]"
										>E{String(candidate.episode).padStart(2, '0')}</span
									>
								{/if}
							</div>
							<div class="flex shrink-0 gap-2">
								<form
									method="POST"
									action={`${base}/?/dispose`}
									use:enhance={enhanceDispose(hash, 'removed')}
								>
									<input type="hidden" name="hash" value={hash} />
									<input type="hidden" name="disposition" value="removed" />
									<button
										type="submit"
										disabled={inFlight}
										class="text-muted-foreground hover:text-foreground rounded-lg bg-white/6 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
									>
										Remove
									</button>
								</form>
								<form
									method="POST"
									action={`${base}/?/dispose`}
									use:enhance={enhanceDispose(hash, 'deleted')}
								>
									<input type="hidden" name="hash" value={hash} />
									<input type="hidden" name="disposition" value="deleted" />
									<button
										type="submit"
										disabled={inFlight}
										class="text-destructive/80 hover:text-destructive rounded-lg bg-white/6 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
									>
										Delete
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
