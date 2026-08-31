<script lang="ts">
	import {
		candidatePosterUrl,
		candidateTitle,
		formatEta,
		formatRelativeTime,
		formatSpeed,
		getTorrentDisplayStatus,
		initialBox
	} from '$lib/helpers';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import type {
		CandidateStateRecord,
		ManualGrabTrackedEntry,
		TorrentOriginSource,
		TorrentStatSnapshot
	} from '$lib/types';
	import { deserialize, enhance } from '$app/forms';
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import FastForwardIcon from '@lucide/svelte/icons/fast-forward';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import RssIcon from '@lucide/svelte/icons/rss';
	import HandGrabIcon from '@lucide/svelte/icons/hand-grab';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import WandSparklesIcon from '@lucide/svelte/icons/wand-sparkles';

	/** Where a torrent came from, for the origin icon next to the media-type
	 * pills — RSS feed match, a manual search grab, or the library
	 * reconciler adopting a torrent/file it found sitting outside
	 * pirate-claw's own bookkeeping (e.g. added by hand through
	 * Transmission's own web UI). See torrentOrigin. */
	type TorrentOrigin = 'rss' | 'manual' | 'adopted';

	const ADOPTED_SOURCES = new Set<TorrentOriginSource>([
		'adopted-transmission',
		'adopted-filesystem',
		'adopted-plex'
	]);

	/** candidate truthy means a candidate_state row exists, which only ever
	 * happens for an RSS-pipeline torrent (manual grabs deliberately never
	 * write there — see manual-grabs/schema.ts) — no separate origin marker
	 * is needed for that case. Otherwise origin comes from the `source`
	 * attached by /api/transmission/torrents (see ManualGrabDisplayInfo). */
	function torrentOrigin(
		candidate: CandidateStateRecord | null,
		source: TorrentOriginSource | undefined
	): TorrentOrigin | null {
		if (candidate) return 'rss';
		if (!source) return null;
		return ADOPTED_SOURCES.has(source) ? 'adopted' : 'manual';
	}

	const ORIGIN_LABEL: Record<TorrentOrigin, string> = {
		rss: 'From an RSS feed match',
		manual: 'Manually grabbed',
		adopted: 'Adopted — found outside pirate-claw (e.g. added directly in Transmission)'
	};

	type ActiveDownload = {
		torrent: TorrentStatSnapshot;
		candidate: CandidateStateRecord | null;
	};

	type MenuAction = 'pause' | 'resume' | 'resumeNow' | 'remove' | 'removeAndDelete';
	type MenuItem = { label: string; action: MenuAction; destructive?: boolean };
	type MenuState = { hash: string; x: number; y: number; items: MenuItem[] };

	const {
		activeDownloads,
		missingCandidates,
		missingManualGrabs,
		transmissionLoaded
	}: {
		activeDownloads: ActiveDownload[];
		missingCandidates: CandidateStateRecord[];
		/** The manual-grab sibling of missingCandidates — see +page.svelte. */
		missingManualGrabs: ManualGrabTrackedEntry[];
		transmissionLoaded: boolean;
	} = $props();

	let inflightDispose = $state<string | null>(null);

	// This 500ms setTimeout is the whole long-press mechanism — the row's own
	// CSS (`touch-pan-y`, `-webkit-user-drag:none`, `draggable="false"` on the
	// poster <img>) exists purely to stop iPadOS from preempting it before it
	// fires. Confirmed live: Safari/Chrome/Brave on iPad all broke here (fixed
	// in an earlier pass by disabling text-selection/callout only), while
	// phones — including iPhone Safari, same WebKit engine — worked fine. The
	// difference is iPadOS-specific: WebKit enables native image drag-lift by
	// default (its own OS-level drag-and-drop), and a long-press starting on
	// the poster <img> gets claimed by that gesture recognizer instead of
	// reaching this timer. Apple mandates WebKit for every iOS/iPadOS browser,
	// so "3 different browsers, same bug" was the tell that this was an
	// engine/OS quirk, not app-browser-compat. `-webkit-user-drag:none` (plus
	// the belt-and-suspenders `draggable="false"`) is the actual fix;
	// `touch-pan-y` further restricts the row to vertical-scroll-only so no
	// other native gesture (pinch, double-tap-zoom) can grab the touch either,
	// while still letting the list itself scroll normally.
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

	/** Merges missingCandidates (RSS-pipeline, keyed by identityKey) and
	 * missingManualGrabs (keyed by hash) into one shape so the "Missing from
	 * Transmission" section renders as a single list with one heading and
	 * one set of bulk actions, instead of two near-identical blocks. */
	type MissingItem = {
		hash: string;
		title: string;
		mediaType: 'tv' | 'movie' | null;
		season: number | null;
		episode: number | null;
	};

	const missingItems = $derived<MissingItem[]>([
		...missingCandidates.map((candidate) => ({
			hash: candidate.transmissionTorrentHash!,
			title: candidateTitle(candidate),
			mediaType: candidate.mediaType,
			season: candidate.mediaType === 'tv' ? (candidate.season ?? null) : null,
			episode: candidate.mediaType === 'tv' ? (candidate.episode ?? null) : null
		})),
		...missingManualGrabs.map((grab) => ({
			hash: grab.hash,
			title: grab.displayTitle ?? grab.normalizedTitle ?? grab.hash,
			mediaType: grab.mediaType,
			season: grab.mediaType === 'tv' ? (grab.season ?? null) : null,
			episode: grab.mediaType === 'tv' ? (grab.episode ?? null) : null
		}))
	]);

	/** The dispose action's bare POST, no toast/invalidate side effects — the
	 * bulk-dispose sibling of postAction, used by bulkDisposeMissing the same
	 * way postAction is used by runBulkTorrentAction. */
	async function postDispose(
		hash: string,
		disposition: 'removed' | 'deleted'
	): Promise<boolean | 'redirect'> {
		const formData = new FormData();
		formData.append('hash', hash);
		formData.append('disposition', disposition);
		const res = await fetch(`${base}/?/dispose`, {
			method: 'POST',
			headers: {
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			},
			body: formData,
			cache: 'no-store'
		});
		const result = deserialize(await res.text());
		if (result.type === 'redirect') return 'redirect';
		return result.type === 'success';
	}

	async function bulkDisposeMissing(disposition: 'removed' | 'deleted') {
		if (bulkAction) return;
		const hashes = missingItems.map((item) => item.hash);
		if (hashes.length === 0) return;

		bulkAction = disposition === 'removed' ? 'removeAllMissing' : 'deleteAllMissing';
		let failCount = 0;
		let redirected = false;
		try {
			for (const hash of hashes) {
				try {
					const outcome = await postDispose(hash, disposition);
					if (outcome === 'redirect') {
						redirected = true;
						break;
					}
					if (!outcome) failCount++;
				} catch {
					failCount++;
				}
			}
			await invalidateAll();
			if (redirected) return;

			const succeeded = hashes.length - failCount;
			const verb = disposition === 'removed' ? 'Removed' : 'Deleted';
			if (failCount === 0) {
				toast(`${verb} ${succeeded} torrent${succeeded === 1 ? '' : 's'}`, 'success');
			} else if (succeeded === 0) {
				toast('Bulk action failed', 'error');
			} else {
				toast(`${verb} ${succeeded}/${hashes.length} — ${failCount} failed`, 'error');
			}
		} finally {
			bulkAction = null;
		}
	}

	/** Best-effort auto-resolve — walks the pirate-claw media dirs server-side
	 * (see /api/transmission/torrents/auto-reconcile) and marks 'removed'
	 * anything whose media file it actually found on disk. Deliberately never
	 * marks 'deleted': not finding the file doesn't prove it was deleted, so
	 * that call is left to a human either way. */
	async function autoReconcileMissing() {
		if (bulkAction) return;
		bulkAction = 'autoReconcile';
		try {
			const res = await fetch(`${base}/?/autoReconcile`, {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'x-sveltekit-action': 'true'
				},
				body: new FormData(),
				cache: 'no-store'
			});
			const result = deserialize(await res.text());
			if (result.type === 'redirect') return;
			if (result.type !== 'success') {
				toast('Auto-resolve failed', 'error');
				return;
			}
			const data = result.data as { resolved?: string[]; checked?: number } | undefined;
			const resolvedCount = data?.resolved?.length ?? 0;
			const checked = data?.checked ?? 0;
			await invalidateAll();
			if (checked === 0) {
				toast('Nothing to check', 'success');
			} else if (resolvedCount === 0) {
				toast(`Checked ${checked} — none found on disk`, 'success');
			} else {
				toast(`Marked ${resolvedCount} of ${checked} as removed — found on disk`, 'success');
			}
		} catch {
			toast('Auto-resolve failed', 'error');
		} finally {
			bulkAction = null;
		}
	}

	function rowDisplayState(
		torrent: TorrentStatSnapshot,
		candidate: CandidateStateRecord | null
	): 'downloading' | 'seeding' | 'queued' | 'paused' | 'completed' | 'removed' | 'deleted' {
		if (candidate?.pirateClawDisposition === 'deleted') return 'deleted';
		if (torrent.status === 'seeding') return 'seeding';
		if (torrent.percentDone === 1) return 'completed';
		if (candidate?.pirateClawDisposition === 'removed') return 'removed';
		// 'queued' means Transmission itself is holding the torrent back for
		// its active-torrent cap (see Queue Caps on the config page) — distinct
		// from 'stopped', an actual pause. A plain "Resume" is a no-op on a
		// queued torrent since Transmission already considers it started; only
		// "Resume Now" (torrent-start-now, bypassing the cap) applies there.
		if (torrent.status === 'queued') return 'queued';
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
		if (state === 'paused')
			return [
				{ label: 'Resume', action: 'resume' },
				{ label: 'Resume Now (skip queue)', action: 'resumeNow' },
				...destructiveItems
			];
		if (state === 'queued')
			return [{ label: 'Resume Now (skip queue)', action: 'resumeNow' }, ...destructiveItems];
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
		resumeNow: 'Resumed now — skipped the queue',
		remove: 'Torrent removed',
		removeAndDelete: 'Torrent removed and data deleted'
	};

	/** The bare POST + result-shape check, with no toast/invalidate side
	 * effects — shared by executeAction (single torrent, own toast + refresh)
	 * and bulkRemoveSeeding (many torrents, one summary toast + one refresh
	 * at the end rather than N of each). Returns whether the daemon actually
	 * confirmed success; a redirect (session expired mid-action) counts as
	 * neither success nor failure — the caller just stops. */
	async function postAction(action: MenuAction, hash: string): Promise<boolean | 'redirect'> {
		const formData = new FormData();
		formData.append('hash', hash);
		const actionHref = `${base}/?/${action}`;
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
		if (result.type === 'redirect') return 'redirect';
		// Only a recognized 'success' shape counts as success — anything else
		// (error, failure, or a response deserialize() couldn't even
		// recognize, e.g. SvelteKit's own raw CSRF-rejection JSON, which has
		// no `type` field at all) must not fall through to a false-positive
		// result. Confirmed live: a misconfigured ORIGIN made every POST here
		// 403 with a plain {message} body, and the old `!== error/failure`
		// check treated that unrecognized shape as success.
		return result.type === 'success';
	}

	async function executeAction(action: MenuAction, hash: string) {
		// Also blocked while a bulk torrent action is running, not just another
		// single action — runBulkTorrentAction's sequential loop exists
		// specifically to avoid a burst of simultaneous RPCs against
		// Transmission (see its own comment); a concurrent single-row action
		// from a row outside that bulk action's own hash list (which its
		// per-row inFlightRow check doesn't cover) would defeat that.
		if (inflightAction || bulkAction !== null) return;
		menuState = null;
		inflightAction = hash;
		try {
			const outcome = await postAction(action, hash);
			if (outcome === 'redirect') return;
			if (!outcome) {
				toast('Action failed', 'error');
				return;
			}

			toast(actionToasts[action], 'success');
			// Refresh load data; avoid applyAction(result) so a stale serialized snapshot cannot
			// overwrite a newer invalidate (e.g. pause right after requeue finishes invalidating).
			await invalidateAll();
			// Follow-up load: Transmission can lag one torrent-get behind stop/remove RPCs.
			if (
				action === 'pause' ||
				action === 'resume' ||
				action === 'resumeNow' ||
				action === 'remove' ||
				action === 'removeAndDelete'
			) {
				await new Promise((r) => setTimeout(r, 150));
				await invalidateAll();
			}
		} catch {
			toast('Action failed', 'error');
		} finally {
			if (inflightAction === hash) inflightAction = null;
		}
	}

	type BulkKind =
		| 'removeSeeding'
		| 'resumeAll'
		| 'pauseAll'
		| 'removeAllMissing'
		| 'deleteAllMissing'
		| 'autoReconcile';
	let bulkAction = $state<BulkKind | null>(null);

	const seedingHashes = $derived(
		activeDownloads
			.filter(({ torrent, candidate }) => rowDisplayState(torrent, candidate) === 'seeding')
			.map(({ torrent }) => torrent.hash)
	);

	// Resume All is a force-resume (skips the queue cap) on everything that
	// isn't already doing work — paused or queued. Pause All is the mirror:
	// everything currently doing (or about to do) work, including a queued
	// torrent, since pausing it explicitly is meaningfully different from
	// leaving it waiting on the cap.
	const resumableHashes = $derived(
		activeDownloads
			.filter(({ torrent, candidate }) => {
				const state = rowDisplayState(torrent, candidate);
				return state === 'paused' || state === 'queued';
			})
			.map(({ torrent }) => torrent.hash)
	);
	const pausableHashes = $derived(
		activeDownloads
			.filter(({ torrent, candidate }) => {
				const state = rowDisplayState(torrent, candidate);
				return state === 'downloading' || state === 'seeding' || state === 'queued';
			})
			.map(({ torrent }) => torrent.hash)
	);

	/** Sequential, not Promise.all — a burst of N simultaneous RPCs against
	 * Transmission's single-threaded RPC server risks the daemon's own
	 * request handling piling up under load in a way one-at-a-time never
	 * does; none of these lists are expected to be large enough for
	 * sequential latency to matter in practice. Shared by the seeding bulk
	 * remove, Resume All, and Pause All — same one-summary-toast,
	 * one-refresh-at-the-end shape either way. */
	// Deliberately its own wording, not actionToasts[action] — actionToasts'
	// strings read fine as "<verb>" on their own (single-row toast) but not as
	// a "<verb> N torrents" prefix (e.g. actionToasts.resumeNow is "Resumed
	// now — skipped the queue", which would read as "Resumed now — skipped
	// the queue 3 torrents").
	const bulkVerbs: Record<'removeSeeding' | 'resumeAll' | 'pauseAll', string> = {
		removeSeeding: 'Removed',
		resumeAll: 'Resumed',
		pauseAll: 'Paused'
	};

	async function runBulkTorrentAction(
		kind: 'removeSeeding' | 'resumeAll' | 'pauseAll',
		action: MenuAction,
		hashes: string[]
	) {
		if (bulkAction || inflightAction) return;
		if (hashes.length === 0) return;

		bulkAction = kind;
		let failCount = 0;
		let redirected = false;
		try {
			for (const hash of hashes) {
				try {
					const outcome = await postAction(action, hash);
					if (outcome === 'redirect') {
						// Session expired mid-loop — stop attempting further
						// actions, but whatever already succeeded before this
						// point is real and must not be left stale in the UI (see
						// the refresh below, unlike a single-item redirect where
						// nothing could have succeeded yet).
						redirected = true;
						break;
					}
					if (!outcome) failCount++;
				} catch {
					failCount++;
				}
			}
			await new Promise((r) => setTimeout(r, 150));
			await invalidateAll();
			if (redirected) return;

			const succeeded = hashes.length - failCount;
			const verb = bulkVerbs[kind];
			if (failCount === 0) {
				toast(`${verb} ${succeeded} torrent${succeeded === 1 ? '' : 's'}`, 'success');
			} else if (succeeded === 0) {
				toast('Bulk action failed', 'error');
			} else {
				toast(`${verb} ${succeeded}/${hashes.length} — ${failCount} failed`, 'error');
			}
		} finally {
			bulkAction = null;
		}
	}

	const bulkRemoveSeeding = () => runBulkTorrentAction('removeSeeding', 'remove', seedingHashes);
	const bulkResumeAll = () => runBulkTorrentAction('resumeAll', 'resumeNow', resumableHashes);
	const bulkPauseAll = () => runBulkTorrentAction('pauseAll', 'pause', pausableHashes);

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
		{#if resumableHashes.length > 0 || pausableHashes.length > 0 || seedingHashes.length > 0}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap gap-2">
					{#if resumableHashes.length > 0}
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="rounded-full"
							disabled={bulkAction !== null || inflightAction !== null}
							onclick={bulkResumeAll}
						>
							{#if bulkAction === 'resumeAll'}
								<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
								Resuming…
							{:else}
								<FastForwardIcon class="mr-2 h-3.5 w-3.5" />
								Resume All
							{/if}
						</Button>
					{/if}
					{#if pausableHashes.length > 0}
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="rounded-full"
							disabled={bulkAction !== null || inflightAction !== null}
							onclick={bulkPauseAll}
						>
							{#if bulkAction === 'pauseAll'}
								<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
								Pausing…
							{:else}
								<PauseIcon class="mr-2 h-3.5 w-3.5" />
								Pause All
							{/if}
						</Button>
					{/if}
				</div>
				{#if seedingHashes.length > 0}
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="border-destructive/30 text-destructive hover:bg-destructive/10 rounded-full"
						disabled={bulkAction !== null || inflightAction !== null}
						onclick={bulkRemoveSeeding}
					>
						{#if bulkAction === 'removeSeeding'}
							<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
							Removing…
						{:else}
							<Trash2Icon class="mr-2 h-3.5 w-3.5" />
							Remove {seedingHashes.length} seeding
						{/if}
					</Button>
				{/if}
			</div>
		{/if}
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
					{@const title = candidate
						? candidateTitle(candidate)
						: (torrent.displayTitle ?? torrent.name)}
					{@const posterUrl = candidate
						? candidatePosterUrl(candidate)
						: (torrent.posterUrl ?? null)}
					{@const mediaType = candidate?.mediaType ?? torrent.mediaType ?? null}
					{@const season = candidate?.season ?? torrent.season ?? null}
					{@const episode = candidate?.episode ?? torrent.episode ?? null}
					{@const origin = torrentOrigin(candidate, torrent.source)}
					{@const rowState = rowDisplayState(torrent, candidate)}
					{@const inFlightRow =
						inflightAction === torrent.hash ||
						// executeAction blocks every row while a bulk torrent action is
						// running (see its own guard), not just the rows that bulk
						// action targets — the disabled state here has to match that
						// exactly, or a row outside the bulk action's hash list
						// renders enabled while clicking it is silently a no-op.
						bulkAction !== null}
					{@const showUpload =
						rowState === 'completed' ||
						rowState === 'seeding' ||
						rowState === 'paused' ||
						rowState === 'queued'}
					<li
						class="border-border bg-background/45 flex touch-pan-y gap-4 rounded-[26px] border p-4 select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none]"
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
								draggable="false"
								class="h-24 w-16 shrink-0 rounded-2xl object-cover [-webkit-user-drag:none]"
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
								{#if mediaType}
									<span class="rounded-full bg-white/6 px-2 py-1 uppercase">{mediaType}</span>
								{/if}
								{#if mediaType === 'tv' && season != null}
									<span class="rounded-full bg-white/6 px-2 py-1"
										>S{String(season).padStart(2, '0')}</span
									>
								{/if}
								{#if mediaType === 'tv' && episode != null}
									<span class="rounded-full bg-white/6 px-2 py-1"
										>E{String(episode).padStart(2, '0')}</span
									>
								{/if}
								{#if candidate?.resolution}
									<span class="rounded-full bg-white/6 px-2 py-1">{candidate.resolution}</span>
								{/if}
								{#if candidate?.codec}
									<span class="rounded-full bg-white/6 px-2 py-1">{candidate.codec}</span>
								{/if}
								{#if origin}
									<span class="bg-border h-4 w-px self-center" aria-hidden="true"></span>
									<span
										class="flex items-center rounded-full bg-white/6 px-2 py-1"
										title={ORIGIN_LABEL[origin]}
									>
										{#if origin === 'rss'}
											<RssIcon class="h-3 w-3" />
										{:else if origin === 'manual'}
											<HandGrabIcon class="h-3 w-3" />
										{:else}
											<FolderIcon class="h-3 w-3" />
										{/if}
									</span>
								{/if}
							</div>
							<div class="mt-1.5 flex flex-wrap items-center gap-2">
								<StatusChip status={getTorrentDisplayStatus(torrent)} />
								{#if rowState !== 'removed' && rowState !== 'deleted'}
									<!-- Long-press/right-click still opens the same actions as a
									     context menu, but iPad's WebKit consistently preempts the
									     touch sequence before it fires (see the long-press comment
									     above) even with the drag/callout workarounds in place —
									     confirmed still broken live across Safari/Chrome/Brave on
									     iPad. These always-visible icon buttons are the reliable
									     fallback: plain taps, no gesture recognizer to fight.

									     stopPropagation on both touchstart and click is load-bearing,
									     not defensive: this whole group renders inside the <li> that
									     owns the long-press timer (ontouchstart above). Without it, a
									     tap lasting >=500ms both runs the button's own action AND
									     bubbles to the row, starting the long-press timer, which then
									     fires openMenu() on top of it — the exact "gesture recognizer
									     fight" this fallback exists to avoid. Confirmed live. -->
									<span class="bg-border h-4 w-px" aria-hidden="true"></span>
									<div
										class="flex items-center gap-1.5"
										role="group"
										aria-label="Torrent actions"
										ontouchstart={(e) => e.stopPropagation()}
									>
										{#if rowState === 'paused'}
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												aria-label="Resume"
												disabled={inFlightRow}
												onclick={(e) => {
													e.stopPropagation();
													executeAction('resume', torrent.hash);
												}}
											>
												<PlayIcon />
											</Button>
										{/if}
										{#if rowState === 'paused' || rowState === 'queued'}
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												aria-label="Resume now — skip the queue cap"
												title="Resume now — skip the queue cap"
												disabled={inFlightRow}
												onclick={(e) => {
													e.stopPropagation();
													executeAction('resumeNow', torrent.hash);
												}}
											>
												<FastForwardIcon />
											</Button>
										{:else if rowState === 'downloading' || rowState === 'seeding'}
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												aria-label="Pause"
												disabled={inFlightRow}
												onclick={(e) => {
													e.stopPropagation();
													executeAction('pause', torrent.hash);
												}}
											>
												<PauseIcon />
											</Button>
										{/if}
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											class="hover:text-destructive"
											aria-label="Remove"
											disabled={inFlightRow}
											onclick={(e) => {
												e.stopPropagation();
												executeAction('remove', torrent.hash);
											}}
										>
											<CircleXIcon />
										</Button>
										<Button
											type="button"
											variant="destructive"
											size="icon-sm"
											aria-label="Remove and delete data"
											disabled={inFlightRow}
											onclick={(e) => {
												e.stopPropagation();
												executeAction('removeAndDelete', torrent.hash);
											}}
										>
											<Trash2Icon />
										</Button>
									</div>
								{/if}
							</div>
							{#if torrent.percentDone !== 1}
								<div class="mt-1">
									<div class="text-primary/80 mb-2 flex items-center justify-between text-xs">
										{#if formatRelativeTime(torrent.addedDate)}
											<p class="text-muted-foreground font-medium">
												Added {formatRelativeTime(torrent.addedDate)}
											</p>
										{:else}
											<span></span>
										{/if}
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
		{#if missingItems.length > 0}
			<div class="border-border border-t pt-4">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
					<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
						Missing from Transmission
					</p>
					<div class="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="rounded-full"
							disabled={bulkAction !== null}
							onclick={autoReconcileMissing}
						>
							{#if bulkAction === 'autoReconcile'}
								<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
								Checking…
							{:else}
								<WandSparklesIcon class="mr-2 h-3.5 w-3.5" />
								Auto
							{/if}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="rounded-full"
							disabled={bulkAction !== null}
							onclick={() => bulkDisposeMissing('removed')}
						>
							{#if bulkAction === 'removeAllMissing'}
								<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
								Removing…
							{:else}
								Remove All
							{/if}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="border-destructive/30 text-destructive hover:bg-destructive/10 rounded-full"
							disabled={bulkAction !== null}
							onclick={() => bulkDisposeMissing('deleted')}
						>
							{#if bulkAction === 'deleteAllMissing'}
								<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
								Deleting…
							{:else}
								Delete All
							{/if}
						</Button>
					</div>
				</div>
				<ul class="space-y-3">
					{#each missingItems as item (item.hash)}
						{@const inFlight = inflightDispose === item.hash || bulkAction !== null}
						<li
							class="border-border bg-background/45 flex items-center justify-between gap-3 rounded-[20px] border p-3"
						>
							<div class="mr-2 flex min-w-0 items-center gap-1.5 overflow-hidden">
								<p class="shrink truncate text-sm font-medium">{item.title}</p>
								{#if item.mediaType}
									<span
										class="text-muted-foreground shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[10px] uppercase"
										>{item.mediaType}</span
									>
								{/if}
								{#if item.mediaType === 'tv' && item.season != null}
									<span
										class="text-muted-foreground shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[10px]"
										>S{String(item.season).padStart(2, '0')}</span
									>
								{/if}
								{#if item.mediaType === 'tv' && item.episode != null}
									<span
										class="text-muted-foreground shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[10px]"
										>E{String(item.episode).padStart(2, '0')}</span
									>
								{/if}
							</div>
							<div class="flex shrink-0 gap-2">
								<form
									method="POST"
									action={`${base}/?/dispose`}
									use:enhance={enhanceDispose(item.hash, 'removed')}
								>
									<input type="hidden" name="hash" value={item.hash} />
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
									use:enhance={enhanceDispose(item.hash, 'deleted')}
								>
									<input type="hidden" name="hash" value={item.hash} />
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
