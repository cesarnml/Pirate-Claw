<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/toast';
	import type { TorrentSearchResult } from '$lib/types';
	import SearchIcon from '@lucide/svelte/icons/search';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	// Shared by the calendar tab's cards and the Top Movies of Year tab's
	// rows — both need identical grab mechanics (search apibay/YTS, pick a
	// torrent, queue to Transmission), just embedded in differently-shaped
	// parent markup. See notes/public/movie-calendar-scope.md: this is the
	// movie calendar's half of the "chimera" (the other half being
	// shows/[slug]'s MissingEpisodesPanel, which this closely mirrors).
	const props = $props<{
		tmdbId: number;
		title: string;
		year: number | null;
		imdbId: string | null;
		alreadyGrabbed: boolean;
		onGrabbed: () => void;
	}>();

	type SearchSource = 'thepiratebay' | 'yts';
	const SEARCH_SOURCES: Array<{
		source: SearchSource;
		label: string;
		shortLabel: string;
	}> = [
		{ source: 'thepiratebay', label: 'Find on ThePirateBay', shortLabel: 'ThePirateBay' },
		{ source: 'yts', label: 'Find on YTS', shortLabel: 'YTS' }
	];

	let expandedSource = $state<SearchSource | null>(null);
	type LookupState =
		| { status: 'loading'; startedAt: number }
		| { status: 'error'; message: string }
		| { status: 'ready'; torrents: TorrentSearchResult[] };
	let searchResults = $state<Record<SearchSource, LookupState | undefined>>({
		thepiratebay: undefined,
		yts: undefined
	});
	let pendingTorrentId = $state<number | null>(null);

	// Drives the "still searching… Ns" text below — a bare spinner for the
	// full 30s search timeout reads as frozen, same complaint as the error
	// message this ships alongside. Ticks for the component's whole
	// lifetime rather than only while something's loading; one interval is
	// cheap and avoids start/stop bookkeeping racing the searches it times.
	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	async function runSearch(source: SearchSource): Promise<void> {
		const { label, shortLabel } = SEARCH_SOURCES.find((s) => s.source === source)!;
		searchResults = { ...searchResults, [source]: { status: 'loading', startedAt: Date.now() } };
		try {
			// The daemon endpoint for thepiratebay is title/year-keyed (a plain
			// text search); yts is imdb-id-keyed and the daemon resolves that
			// itself from tmdbId, so it takes no query params at all.
			const path = source === 'thepiratebay' ? 'apibay' : 'yts';
			const query =
				source === 'thepiratebay'
					? `?title=${encodeURIComponent(props.title)}${props.year ? `&year=${props.year}` : ''}`
					: '';
			const res = await fetch(`/movie-calendar/${props.tmdbId}/${path}${query}`);
			const body = (await res.json()) as { torrents?: TorrentSearchResult[]; error?: string };
			if (!res.ok || !body.torrents) {
				searchResults = {
					...searchResults,
					[source]: { status: 'error', message: body.error ?? `${label} failed.` }
				};
				return;
			}
			searchResults = { ...searchResults, [source]: { status: 'ready', torrents: body.torrents } };
		} catch {
			searchResults = {
				...searchResults,
				[source]: { status: 'error', message: `Could not reach ${shortLabel}.` }
			};
		}
	}

	async function findOn(source: SearchSource): Promise<void> {
		if (expandedSource === source) {
			expandedSource = null;
			return;
		}
		expandedSource = source;
		if (searchResults[source]) return;
		await runSearch(source);
	}

	function formatSize(bytes: number): string {
		if (bytes <= 0) return '—';
		const gb = bytes / 1_073_741_824;
		if (gb >= 1) return `${gb.toFixed(1)} GB`;
		return `${(bytes / 1_048_576).toFixed(0)} MB`;
	}

	function enhanceGrab(torrentId: number) {
		pendingTorrentId = torrentId;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			await update();
			pendingTorrentId = null;
			if (result.type === 'success') {
				toast('Queued', 'success', (result.data?.grabMessage as string) ?? undefined);
				expandedSource = null;
				searchResults = { thepiratebay: undefined, yts: undefined };
				props.onGrabbed();
			} else if (result.type === 'failure') {
				toast('Grab failed', 'error', (result.data?.grabMessage as string) ?? undefined);
			} else if (result.type === 'error') {
				toast('Grab failed', 'error', 'Could not reach the API.');
			}
		};
	}
</script>

{#if props.alreadyGrabbed}
	<span
		class="border-border text-muted-foreground self-start rounded-full border px-3 py-1 text-xs font-medium"
	>
		Already grabbed
	</span>
{:else}
	<div class="flex flex-wrap gap-2">
		{#each SEARCH_SOURCES as { source, label, shortLabel }}
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="rounded-full"
				onclick={() => findOn(source)}
			>
				<SearchIcon class="mr-2 h-3.5 w-3.5" />
				{expandedSource === source ? `Hide ${shortLabel} results` : label}
			</Button>
		{/each}
	</div>

	{#each SEARCH_SOURCES as { shortLabel, source }}
		{@const lookup = searchResults[source]}
		{#if expandedSource === source && lookup}
			<div class="mt-2 space-y-2">
				{#if lookup.status === 'loading'}
					<p class="text-muted-foreground text-sm">
						Searching {shortLabel}… ({Math.floor((now - lookup.startedAt) / 1000)}s)
					</p>
				{:else if lookup.status === 'error'}
					<div class="flex flex-wrap items-center gap-2">
						<p class="text-destructive text-sm">{lookup.message}</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="rounded-full"
							onclick={() => runSearch(source)}
						>
							Retry
						</Button>
					</div>
				{:else if lookup.torrents.length === 0}
					<p class="text-muted-foreground text-sm">No {shortLabel} results for this movie.</p>
				{:else}
					{#each lookup.torrents as torrent (torrent.id)}
						<div
							class="bg-background/50 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3"
						>
							<div class="min-w-0 flex-1 space-y-1">
								<p class="truncate text-sm font-medium">{torrent.title}</p>
								<div class="flex flex-wrap gap-2 text-xs">
									{#if torrent.resolution}
										<Badge variant="outline">{torrent.resolution}</Badge>
									{/if}
									{#if torrent.codec}
										<Badge variant="outline">{torrent.codec}</Badge>
									{/if}
									<Badge variant="outline">{formatSize(torrent.sizeBytes)}</Badge>
									<Badge variant="outline">{torrent.seeds} seeds / {torrent.peers} peers</Badge>
								</div>
							</div>
							<form
								method="POST"
								action="/movie-calendar?/manualGrab"
								use:enhance={() => enhanceGrab(torrent.id)}
							>
								<input type="hidden" name="tmdbId" value={props.tmdbId} />
								<input type="hidden" name="imdbId" value={props.imdbId ?? ''} />
								<input type="hidden" name="magnetUrl" value={torrent.magnetUrl} />
								<input type="hidden" name="rawTitle" value={torrent.title} />
								<input type="hidden" name="source" value={source} />
								<Button
									type="submit"
									size="sm"
									class="shrink-0 rounded-full"
									disabled={pendingTorrentId !== null}
								>
									{#if pendingTorrentId === torrent.id}
										<Loader2Icon class="mr-2 h-3.5 w-3.5 animate-spin" />
										Queuing…
									{:else}
										<DownloadIcon class="mr-2 h-3.5 w-3.5" />
										Grab
									{/if}
								</Button>
							</form>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	{/each}
{/if}
